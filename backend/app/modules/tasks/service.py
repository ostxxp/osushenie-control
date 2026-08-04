from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.objects.models import ConstructionObject, ObjectToUser
from app.modules.tasks.dependencies import get_object_task_or_404
from app.modules.tasks.models import (
    ObjectTask,
    ObjectTaskStatus,
    TaskChildrenMode,
    TaskTemplate,
)
from app.modules.tasks.stages import PROJECT_STAGES, ProjectStage, infer_project_stage
from app.modules.notifications.models import Notifications, NotificationReads as NotificationReceipt
from app.modules.notifications.service import create_notification
from app.modules.tasks.schemas import (
    ObjectTaskAssignmentUpdate,
    ObjectTaskCreate,
    ObjectTaskUpdate,
)
from app.modules.users.models import User, UserRole
from app.modules.users.schemas import UserRead

from app.modules.notifications.models import NotificationType

BLOCKING_STATUSES = {
    ObjectTaskStatus.SKIPPED,
    ObjectTaskStatus.NOT_APPLICABLE,
}

STOPPING_STATUSES = {
    ObjectTaskStatus.TODO,
    ObjectTaskStatus.IN_PROGRESS,
    ObjectTaskStatus.PENDING_REVIEW,
    ObjectTaskStatus.REJECTED,
}

WORKING_STATUSES = {
    ObjectTaskStatus.IN_PROGRESS,
    ObjectTaskStatus.PENDING_REVIEW,
}


async def copy_task_templates_to_object(
    db: AsyncSession,
    *,
    object_id: int,
) -> list[ObjectTask]:
    result = await db.execute(
        select(TaskTemplate)
        .where(TaskTemplate.is_active.is_(True))
        .order_by(TaskTemplate.depth, TaskTemplate.sort_order, TaskTemplate.id)
    )
    templates = result.scalars().all()

    object: ConstructionObject = await db.get(ConstructionObject, object_id)

    template_to_object_task: dict[int, ObjectTask] = {}
    object_tasks: list[ObjectTask] = []

    for template in templates:
        parent = (
            template_to_object_task.get(template.parent_id)
            if template.parent_id is not None
            else None
        )
        object_task = ObjectTask(
            object_id=object_id,
            parent_id=parent.id if parent is not None else None,
            template_id=template.id,
            title=template.title if "Проект " not in template.title else f'Проект "{object.name}"',
            depth=template.depth if parent is None else parent.depth + 1,
            sort_order=template.sort_order,
            children_mode=template.children_mode,
            stage=template.stage or (parent.stage if parent is not None else infer_project_stage(template.title)),
        )
        db.add(object_task)
        await db.flush()

        template_to_object_task[template.id] = object_task
        object_tasks.append(object_task)

    return object_tasks


async def list_object_tasks(
    db: AsyncSession,
    *,
    object_id: int,
) -> list[ObjectTask]:
    result = await db.execute(
        select(ObjectTask)
        .where(
            ObjectTask.object_id == object_id,
            ObjectTask.is_active.is_(True),
        )
        .order_by(ObjectTask.depth, ObjectTask.sort_order, ObjectTask.id)
    )
    return list(result.scalars().all())

async def list_main_object_tasks(
    db: AsyncSession,
    *,
    object_id: int,
) -> list[ObjectTask]:
    result = await db.execute(
        select(ObjectTask)
        .where(
            ObjectTask.object_id == object_id,
            ObjectTask.is_active.is_(True),
            ObjectTask.parent_id.is_(None),
        )
        .order_by(ObjectTask.sort_order, ObjectTask.id)
    )
    return list(result.scalars().all())


async def _build_completed_by_map(
    db: AsyncSession,
    tasks: list[ObjectTask],
) -> dict[int, dict]:
    completed_by_ids = {
        task.completed_by_id
        for task in tasks
        if task.completed_by_id is not None
    }
    if not completed_by_ids:
        return {}

    result = await db.execute(select(User).where(User.id.in_(completed_by_ids)))
    return {
        user.id: UserRead.model_validate(user).model_dump()
        for user in result.scalars().all()
    }


async def build_object_task_tree(db: AsyncSession, tasks: list[ObjectTask]) -> list[dict]:
    completed_by_map = await _build_completed_by_map(db, tasks)

    nodes_by_id = {
        task.id: {
            "id": task.id,
            "object_id": task.object_id,
            "parent_id": task.parent_id,
            "template_id": task.template_id,
            "title": task.title,
            "depth": task.depth,
            "sort_order": task.sort_order,
            "children_mode": task.children_mode,
            "stage": task.stage,
            "status": task.status,
            "deadline": task.deadline,
            "is_active": task.is_active,
            "version": task.version,
            "completed_at": task.completed_at,
            "completed_by_id": task.completed_by_id,
            "completed_by": completed_by_map.get(task.completed_by_id),
            "assigned_to_id": task.assigned_to_id,
            "assigned_to": task.assigned_to,
            "reviewer_id": task.reviewer_id,
            "reviewer": task.reviewer,
            "submitted_at": task.submitted_at,
            "reviewed_at": task.reviewed_at,
            "reviewed_by_id": task.reviewed_by_id,
            "reviewed_by": task.reviewed_by,
            "rejection_reason": task.rejection_reason,
            "created_at": task.created_at,
            "updated_at": task.updated_at,
            "children": [],
        }
        for task in tasks
    }

    roots = []
    for task in tasks:
        node = nodes_by_id[task.id]
        parent = nodes_by_id.get(task.parent_id)
        if parent is None:
            roots.append(node)
        else:
            parent["children"].append(node)

    return roots


async def create_object_task(
    db: AsyncSession,
    *,
    object_id: int,
    task_data: ObjectTaskCreate,
) -> ObjectTask:
    parent = None
    if task_data.parent_id is not None:
        parent = await get_object_task_or_404(
            object_id=object_id,
            task_id=task_data.parent_id,
            db=db,
        )

    sort_order = task_data.sort_order
    if sort_order is None:
        result = await db.execute(
            select(func.max(ObjectTask.sort_order)).where(
                ObjectTask.object_id == object_id,
                ObjectTask.parent_id == task_data.parent_id,
            )
        )
        max_sort_order = result.scalar_one_or_none()
        sort_order = 0 if max_sort_order is None else max_sort_order + 1

    object_task = ObjectTask(
        object_id=object_id,
        parent_id=parent.id if parent is not None else None,
        template_id=None,
        title=task_data.title,
        depth=0 if parent is None else parent.depth + 1,
        sort_order=sort_order,
        children_mode=task_data.children_mode,
        stage=task_data.stage or (parent.stage if parent is not None else infer_project_stage(task_data.title)),
        deadline=task_data.deadline,
    )
    db.add(object_task)
    await db.commit()
    await db.refresh(object_task)
    return object_task


async def update_object_task(
    db: AsyncSession,
    *,
    object_task: ObjectTask,
    task_data: ObjectTaskUpdate,
    current_user: User,
) -> ObjectTask:
    update_data = task_data.model_dump(exclude_unset=True)
    expected_version = update_data.pop("expected_version", None)
    if expected_version is not None and object_task.version != expected_version:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Task was changed by another user",
                "current_version": object_task.version,
            },
        )

    if task_data.status is not None:
        if task_data.status == ObjectTaskStatus.DONE:
            await _set_children_status_in_progress(
                db,
                parent_task=object_task,
            )
        _set_task_status(
            object_task,
            task_data.status,
            current_user=current_user,
        )
        await _sync_single_choice_siblings(
            db,
            changed_task=object_task,
            current_user=current_user,
        )
        if task_data.status == ObjectTaskStatus.TODO:
            await _reset_descendants_to_todo(
                db,
                root_task=object_task,
            )

    for field in ("title", "sort_order", "children_mode", "is_active", "deadline", "stage"):
        if field in update_data:
            setattr(object_task, field, update_data[field])

    object_task.version += 1
    
    if "status" in update_data:
        taskTitle = object_task.title if object_task.title is not None else "Задача"
        mainTask = object_task
        while mainTask.parent_id is not None:
            mainTask = await db.get(ObjectTask, mainTask.parent_id)
            if mainTask is None:
                break
        taskTitles = (await db.execute(
            select(ObjectTask.title)
            .where(
                ObjectTask.object_id == object_task.object_id,
                ObjectTask.id == object_task.id,
            )
        )).scalars().all()
        if taskTitle in taskTitles and object_task.parent_id is not None:
            parent = await db.get(ObjectTask, object_task.parent_id)
            taskTitle = f"{parent.title} -> {taskTitle}"
        taskTitle = f'{mainTask.title} -> {taskTitle}' if mainTask is not None and mainTask.id != object_task.id else taskTitle
            
        notification_message = f'Статус задачи "{taskTitle}" был изменен на "{object_task.status}".'
        if task_data.status == ObjectTaskStatus.DONE:
            notification_message = f'Задача "{taskTitle}" была выполнена.'
        elif task_data.status == ObjectTaskStatus.TODO:
            notification_message = f'Задача "{taskTitle}" была возвращена в статус "К выполнению".'
        notification = Notifications(
            user_id=current_user.id,
            object_id=object_task.object_id,
            message=notification_message,
        )
        db.add(notification)
        admins_and_chief_engineers = await db.execute(
            select(User)            
            .where(User.role.in_([UserRole.ADMIN, UserRole.CHIEF_ENGINEER]))
        )
        for user in admins_and_chief_engineers.scalars().all():
            notification_receipt = NotificationReceipt(
                user_id=user.id,
                notification=notification,
            )
            db.add(notification_receipt)
    db.add(object_task)
    await db.commit()
    await db.refresh(object_task)
    return object_task


async def get_main_task_id(
    db: AsyncSession,
    *,
    object_task: ObjectTask,
) -> int:
    current_task = object_task

    while current_task.parent_id is not None:
        parent = await db.get(ObjectTask, current_task.parent_id)
        if parent is None:
            break
        current_task = parent

    return current_task.id

async def _set_children_status_in_progress(
    db: AsyncSession,
    *,
    parent_task: ObjectTask
) -> None:
    result = await db.execute(
        select(ObjectTask)
        .where(
            ObjectTask.parent_id == parent_task.id,
            ObjectTask.is_active.is_(True),
        )
    )
    children = result.scalars().all()

    for child in children:
        if child.status == ObjectTaskStatus.NOT_APPLICABLE:
            continue
        _set_task_status(child, ObjectTaskStatus.IN_PROGRESS)

def _set_task_status(
    task: ObjectTask,
    status: ObjectTaskStatus,
    *,
    current_user: User | None = None,
) -> None:
    task.status = status
    if status == ObjectTaskStatus.DONE:
        task.completed_at = datetime.now(UTC)
        task.completed_by_id = current_user.id if current_user is not None else None
        return

    task.completed_at = None
    task.completed_by_id = None


async def _sync_single_choice_siblings(
    db: AsyncSession,
    *,
    changed_task: ObjectTask,
    current_user: User,
) -> None:
    if changed_task.parent_id is None:
        return

    parent = await db.get(ObjectTask, changed_task.parent_id)
    if parent is None or parent.children_mode != TaskChildrenMode.SINGLE_CHOICE:
        return

    tasks = await _list_active_object_tasks(db, object_id=changed_task.object_id)
    children_by_parent_id = _group_tasks_by_parent_id(tasks)
    siblings = children_by_parent_id.get(parent.id, [])

    if changed_task.status == ObjectTaskStatus.DONE:
        for sibling in siblings:
            if sibling.id == changed_task.id:
                continue
            _set_task_status(sibling, ObjectTaskStatus.NOT_APPLICABLE)

        _set_task_status(
            changed_task,
            ObjectTaskStatus.DONE,
            current_user=current_user,
        )
        return

    has_selected_sibling = any(
        sibling.id != changed_task.id
        and sibling.status == ObjectTaskStatus.DONE
        for sibling in siblings
    )
    if has_selected_sibling:
        return

    for sibling in siblings:
        if sibling.id == changed_task.id:
            continue
        if sibling.status == ObjectTaskStatus.NOT_APPLICABLE:
            _set_task_status(sibling, ObjectTaskStatus.TODO)


async def _reset_descendants_to_todo(
    db: AsyncSession,
    *,
    root_task: ObjectTask,
) -> None:
    tasks = await _list_active_object_tasks(db, object_id=root_task.object_id)
    children_by_parent_id = _group_tasks_by_parent_id(tasks)

    def reset_children(parent_id: int) -> None:
        for child in children_by_parent_id.get(parent_id, []):
            _set_task_status(child, ObjectTaskStatus.TODO)
            reset_children(child.id)

    reset_children(root_task.id)


async def _list_active_object_tasks(
    db: AsyncSession,
    *,
    object_id: int,
) -> list[ObjectTask]:
    result = await db.execute(
        select(ObjectTask).where(
            ObjectTask.object_id == object_id,
            ObjectTask.is_active.is_(True),
        )
    )
    return list(result.scalars().all())


def _group_tasks_by_parent_id(tasks: list[ObjectTask]) -> dict[int | None, list[ObjectTask]]:
    children_by_parent_id: dict[int | None, list[ObjectTask]] = {}
    for task in tasks:
        children_by_parent_id.setdefault(task.parent_id, []).append(task)
    for children in children_by_parent_id.values():
        children.sort(key=lambda task: (task.sort_order, task.id))
    return children_by_parent_id


def _get_scope_roots(
    tasks: list[ObjectTask],
    children_by_parent_id: dict[int | None, list[ObjectTask]],
    root_task_id: int | None,
) -> list[ObjectTask]:
    if root_task_id is None:
        return children_by_parent_id.get(None, [])

    tasks_by_id = {task.id: task for task in tasks}
    root = tasks_by_id.get(root_task_id)
    if root is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Main task not found.",
        )
    return [root]


def _collect_task_subtree(
    root: ObjectTask,
    children_by_parent_id: dict[int | None, list[ObjectTask]],
    *,
    include_root: bool,
) -> list[ObjectTask]:
    subtree = [root] if include_root else []

    for child in children_by_parent_id.get(root.id, []):
        subtree.extend(
            _collect_task_subtree(
                child,
                children_by_parent_id,
                include_root=True,
            )
        )

    return subtree


def _get_task_path(
    task: ObjectTask,
    tasks_by_id: dict[int, ObjectTask],
) -> list[ObjectTask]:
    path = [task]
    parent_id = task.parent_id

    while parent_id is not None:
        parent = tasks_by_id.get(parent_id)
        if parent is None:
            break
        path.append(parent)
        parent_id = parent.parent_id

    path.reverse()
    return path


def _serialize_task_list_item(
    task: ObjectTask,
    *,
    tasks_by_id: dict[int, ObjectTask],
    completed_by_map: dict[int, dict],
) -> dict:
    path = _get_task_path(task, tasks_by_id)
    main_task = path[0]

    return {
        "id": task.id,
        "object_id": task.object_id,
        "parent_id": task.parent_id,
        "template_id": task.template_id,
        "title": task.title,
        "depth": task.depth,
        "sort_order": task.sort_order,
        "children_mode": task.children_mode,
        "stage": task.stage,
        "status": task.status,
        "is_active": task.is_active,
        "version": task.version,
        "deadline": task.deadline,
        "completed_at": task.completed_at,
        "completed_by_id": task.completed_by_id,
        "completed_by": completed_by_map.get(task.completed_by_id),
        "assigned_to_id": task.assigned_to_id,
        "assigned_to": task.assigned_to,
        "reviewer_id": task.reviewer_id,
        "reviewer": task.reviewer,
        "submitted_at": task.submitted_at,
        "reviewed_at": task.reviewed_at,
        "reviewed_by_id": task.reviewed_by_id,
        "reviewed_by": task.reviewed_by,
        "rejection_reason": task.rejection_reason,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "main_task_id": main_task.id,
        "main_task_title": main_task.title,
        "path": [path_task.title for path_task in path],
    }


async def group_object_tasks_by_main_task(
    db: AsyncSession,
    *,
    object_id: int,
    tasks: list[ObjectTask],
    root_task_id: int | None = None,
) -> list[dict]:
    all_tasks = await _list_active_object_tasks(db, object_id=object_id)
    children_by_parent_id = _group_tasks_by_parent_id(all_tasks)
    scope_roots = _get_scope_roots(all_tasks, children_by_parent_id, root_task_id)
    tasks_by_id = {task.id: task for task in all_tasks}
    completed_by_map = await _build_completed_by_map(db, tasks)
    items_by_main_task_id: dict[int, list[dict]] = {}

    for task in sorted(tasks, key=lambda item: (item.depth, item.sort_order, item.id)):
        item = _serialize_task_list_item(
            task,
            tasks_by_id=tasks_by_id,
            completed_by_map=completed_by_map,
        )
        items_by_main_task_id.setdefault(item["main_task_id"], []).append(item)

    groups = []
    for root in scope_roots:
        items = items_by_main_task_id.get(root.id, [])
        if not items:
            continue
        groups.append(
            {
                "main_task_id": root.id,
                "main_task_title": root.title,
                "tasks": items,
            }
        )

    return groups


def _empty_task_stats() -> dict[str, int]:
    return {
        "total": 0,
        "done": 0,
        "todo": 0,
        "in_progress": 0,
        "overdue": 0,
    }


def _is_task_overdue(task: ObjectTask) -> bool:
    if task.deadline is None:
        return False

    deadline = task.deadline
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=UTC)

    return (
        deadline < datetime.now(UTC)
        and task.status != ObjectTaskStatus.DONE
        and task.status not in BLOCKING_STATUSES
    )


def _add_status_to_stats(
    stats: dict[str, int],
    status: ObjectTaskStatus,
    *,
    is_overdue: bool = False,
) -> None:
    if status == ObjectTaskStatus.DONE or status in BLOCKING_STATUSES:
        stats["done"] += 1
    elif status in WORKING_STATUSES:
        stats["in_progress"] += 1
    else:
        stats["todo"] += 1

    if is_overdue:
        stats["overdue"] += 1


def _add_task_to_stats(stats: dict[str, int], task: ObjectTask) -> None:
    _add_status_to_stats(
        stats,
        task.status,
        is_overdue=_is_task_overdue(task),
    )


def _get_task_group_status(tasks: list[ObjectTask]) -> ObjectTaskStatus:
    active_tasks = [
        task
        for task in tasks
        if task.status not in BLOCKING_STATUSES
    ]

    if any(task.status == ObjectTaskStatus.DONE for task in active_tasks):
        return ObjectTaskStatus.DONE
    if any(task.status in WORKING_STATUSES for task in active_tasks):
        return ObjectTaskStatus.IN_PROGRESS
    if not active_tasks:
        return ObjectTaskStatus.DONE
    return ObjectTaskStatus.TODO


def _calculate_task_stats(
    tasks: list[ObjectTask],
    scope_roots: list[ObjectTask],
) -> dict[str, int]:
    children_by_parent_id = _group_tasks_by_parent_id(tasks)
    scope_root_ids = {task.id for task in scope_roots}
    stats = _empty_task_stats()

    def count_total_task(task: ObjectTask) -> int:
        children = children_by_parent_id.get(task.id, [])
        if task.id in scope_root_ids and children:
            return count_total_children(task)
        return 1 + count_total_children(task)

    def count_total_children(parent: ObjectTask) -> int:
        children = children_by_parent_id.get(parent.id, [])
        if not children:
            return 0

        if len(children) == 2:
            return 1 + sum(count_total_children(child) for child in children)

        return sum(count_total_task(child) for child in children)

    def count_group(tasks: list[ObjectTask]) -> None:
        group_status = _get_task_group_status(tasks)
        _add_status_to_stats(
            stats,
            group_status,
            is_overdue=group_status != ObjectTaskStatus.DONE
            and any(_is_task_overdue(task) for task in tasks),
        )

    def count_task_as_done(task: ObjectTask) -> None:
        children = children_by_parent_id.get(task.id, [])
        if task.id in scope_root_ids and children:
            count_children_as_done(task)
            return

        stats["done"] += 1
        count_children_as_done(task)

    def count_children_as_done(parent: ObjectTask) -> None:
        children = children_by_parent_id.get(parent.id, [])
        if not children:
            return

        if len(children) == 2:
            stats["done"] += 1
            for child in children:
                count_children_as_done(child)
            return

        for child in children:
            count_task_as_done(child)

    def count_task(task: ObjectTask) -> None:
        if task.status in BLOCKING_STATUSES:
            count_task_as_done(task)
            return

        children = children_by_parent_id.get(task.id, [])
        if task.id in scope_root_ids and children:
            count_children(task)
            return

        _add_task_to_stats(stats, task)
        count_children(task)

    def count_children(parent: ObjectTask) -> None:
        children = children_by_parent_id.get(parent.id, [])
        if not children:
            return

        if len(children) == 2:
            count_group(children)
            for child in children:
                if child.status in BLOCKING_STATUSES:
                    count_children_as_done(child)
                    continue
                count_children(child)
            return

        for child in children:
            count_task(child)

    stats["total"] = sum(
        count_total_task(root)
        for root in scope_roots
    )

    for root in scope_roots:
        count_task(root)

    return stats


async def get_task_stats(
    db: AsyncSession,
    *,
    object_id: int,
    root_task_id: int | None = None,
) -> dict[str, int]:
    tasks = await _list_active_object_tasks(db, object_id=object_id)
    children_by_parent_id = _group_tasks_by_parent_id(tasks)
    scope_roots = _get_scope_roots(tasks, children_by_parent_id, root_task_id)
    return _calculate_task_stats(tasks, scope_roots)


async def get_project_stage_summaries(
    db: AsyncSession,
    *,
    object_id: int,
) -> list[dict]:
    tasks = await _list_active_object_tasks(db, object_id=object_id)
    summaries = []

    for stage_definition in PROJECT_STAGES:
        stage_tasks = [
            task
            for task in tasks
            if task.stage == stage_definition.code
        ]
        stage_task_ids = {task.id for task in stage_tasks}
        stage_roots = [
            task
            for task in stage_tasks
            if task.parent_id not in stage_task_ids
        ]
        summaries.append(
            {
                "code": stage_definition.code,
                "title": stage_definition.title,
                "order": stage_definition.order,
                "stats": _calculate_task_stats(stage_tasks, stage_roots),
            }
        )

    return summaries


async def list_done_object_tasks(
    db: AsyncSession,
    *,
    object_id: int,
    root_task_id: int | None = None,
) -> list[ObjectTask]:
    tasks = await _list_active_object_tasks(db, object_id=object_id)
    children_by_parent_id = _group_tasks_by_parent_id(tasks)
    scope_roots = _get_scope_roots(tasks, children_by_parent_id, root_task_id)
    scoped_tasks: list[ObjectTask] = []

    for root in scope_roots:
        scoped_tasks.extend(
            _collect_task_subtree(
                root,
                children_by_parent_id,
                include_root=root_task_id is None,
            )
        )

    return [
        task
        for task in scoped_tasks
        if task.status == ObjectTaskStatus.DONE
    ]


async def list_logical_todo_object_tasks(
    db: AsyncSession,
    *,
    object_id: int,
    root_task_id: int | None = None,
) -> list[ObjectTask]:
    tasks = await _list_active_object_tasks(db, object_id=object_id)
    children_by_parent_id = _group_tasks_by_parent_id(tasks)
    scope_roots = _get_scope_roots(tasks, children_by_parent_id, root_task_id)
    scope_root_ids = {task.id for task in scope_roots}
    todo_tasks: list[ObjectTask] = []

    def collect_task(task: ObjectTask) -> None:
        if task.status in BLOCKING_STATUSES:
            return

        children = children_by_parent_id.get(task.id, [])
        if task.id in scope_root_ids and children:
            collect_children(task)
            return

        if task.status in {ObjectTaskStatus.TODO, ObjectTaskStatus.REJECTED}:
            todo_tasks.append(task)

        if task.status in {
            ObjectTaskStatus.DONE,
            ObjectTaskStatus.IN_PROGRESS,
            ObjectTaskStatus.PENDING_REVIEW,
        }:
            collect_children(task)

    def collect_children(parent: ObjectTask) -> None:
        children = children_by_parent_id.get(parent.id, [])
        if not children:
            return

        if len(children) == 2:
            done_children = [
                child
                for child in children
                if child.status == ObjectTaskStatus.DONE
            ]
            if done_children:
                for child in done_children:
                    collect_children(child)
                return

            active_children = [
                child
                for child in children
                if child.status not in BLOCKING_STATUSES
            ]
            for child in active_children:
                collect_task(child)
            return

        for child in children:
            collect_task(child)

    for root in scope_roots:
        collect_task(root)

    return todo_tasks


async def list_overdue_object_tasks(
    db: AsyncSession,
    *,
    object_id: int,
    root_task_id: int | None = None,
) -> list[ObjectTask]:
    tasks = await _list_active_object_tasks(db, object_id=object_id)
    children_by_parent_id = _group_tasks_by_parent_id(tasks)
    scope_roots = _get_scope_roots(tasks, children_by_parent_id, root_task_id)
    scoped_tasks: list[ObjectTask] = []

    for root in scope_roots:
        scoped_tasks.extend(
            _collect_task_subtree(
                root,
                children_by_parent_id,
                include_root=root_task_id is None,
            )
        )

    return [
        task
        for task in scoped_tasks
        if _is_task_overdue(task)
    ]


async def deactivate_object_task(
    db: AsyncSession,
    *,
    object_task: ObjectTask,
) -> None:
    object_task.is_active = False
    db.add(object_task)
    await db.commit()

async def build_available_task_tree(
    db: AsyncSession,
    *,
    main_task: ObjectTask,
) -> dict:
    completed_by_map = await _build_completed_by_map(
        db,
        await _list_active_object_tasks(db, object_id=main_task.object_id),
    )

    async def serialize_until_blocker(task: ObjectTask) -> dict:
        node = {
            "id": task.id,
            "object_id": task.object_id,
            "parent_id": task.parent_id,
            "template_id": task.template_id,
            "title": task.title,
            "depth": task.depth,
            "sort_order": task.sort_order,
            "children_mode": task.children_mode,
            "stage": task.stage,
            "status": task.status,
            "deadline": task.deadline,
            "days_until_deadline": (task.deadline - datetime.now(UTC)).days if task.deadline is not None else None,
            "is_overdue": task.deadline is not None and task.deadline < datetime.now(UTC) and task.status != ObjectTaskStatus.DONE,
            "is_active": task.is_active,
            "version": task.version,
            "completed_at": task.completed_at,
            "completed_by_id": task.completed_by_id,
            "completed_by": completed_by_map.get(task.completed_by_id),
            "assigned_to_id": task.assigned_to_id,
            "assigned_to": task.assigned_to,
            "reviewer_id": task.reviewer_id,
            "reviewer": task.reviewer,
            "submitted_at": task.submitted_at,
            "reviewed_at": task.reviewed_at,
            "reviewed_by_id": task.reviewed_by_id,
            "reviewed_by": task.reviewed_by,
            "rejection_reason": task.rejection_reason,
            "created_at": task.created_at,
            "updated_at": task.updated_at,
            "children": [],
        }

        if task.status in STOPPING_STATUSES and task.parent_id is not None:
            return node

        result = await db.execute(
            select(ObjectTask)
            .where(
                ObjectTask.object_id == task.object_id,
                ObjectTask.parent_id == task.id,
                ObjectTask.is_active.is_(True),
                ObjectTask.status.notin_(BLOCKING_STATUSES),
            )
            .order_by(ObjectTask.sort_order, ObjectTask.id)
        )
        children = result.scalars().all()

        node["children"] = [
            await serialize_until_blocker(child)
            for child in children
        ]

        return node

    return await serialize_until_blocker(main_task)


async def _get_active_user(db: AsyncSession, user_id: int) -> User:
    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Active user not found.",
        )
    return user


async def _ensure_foreman_has_object_access(
    db: AsyncSession,
    *,
    user: User,
    object_id: int,
) -> None:
    if user.role != UserRole.FOREMAN:
        return
    assignment = await db.scalar(
        select(ObjectToUser).where(
            ObjectToUser.object_id == object_id,
            ObjectToUser.user_id == user.id,
        )
    )
    if assignment is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Foreman must be assigned to the object first.",
        )


def _can_manage_task(task: ObjectTask, user: User) -> bool:
    return user.role in {UserRole.ADMIN, UserRole.CHIEF_ENGINEER} or (
        task.assigned_to_id == user.id
    )


def _can_review_task(task: ObjectTask, user: User) -> bool:
    return user.role in {UserRole.ADMIN, UserRole.CHIEF_ENGINEER} or (
        task.reviewer_id == user.id
    )


def _require_task_status(
    task: ObjectTask,
    allowed_statuses: set[ObjectTaskStatus],
) -> None:
    if task.status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Task cannot be changed from status '{task.status}'.",
        )


async def assign_object_task(
    db: AsyncSession,
    *,
    object_task: ObjectTask,
    assignment: ObjectTaskAssignmentUpdate,
    current_user: User,
) -> ObjectTask:
    assigned_to = None
    reviewer = None
    if assignment.assigned_to_id is not None:
        assigned_to = await _get_active_user(db, assignment.assigned_to_id)
        await _ensure_foreman_has_object_access(
            db,
            user=assigned_to,
            object_id=object_task.object_id,
        )
    if assignment.reviewer_id is not None:
        reviewer = await _get_active_user(db, assignment.reviewer_id)
        if reviewer.role not in {UserRole.ADMIN, UserRole.CHIEF_ENGINEER}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reviewer must be an admin or chief engineer.",
            )

    object_task.assigned_to_id = assigned_to.id if assigned_to is not None else None
    object_task.reviewer_id = reviewer.id if reviewer is not None else None
    object_task.version += 1
    object_task.assigned_to = assigned_to
    object_task.reviewer = reviewer

    recipient_ids = {
        user_id
        for user_id in (object_task.assigned_to_id, object_task.reviewer_id)
        if user_id is not None
    }
    await create_notification(
        db,
        actor_user_id=current_user.id,
        object_id=object_task.object_id,
        recipient_ids=recipient_ids,
        message=f'Назначены участники задачи "{object_task.title}".',
        notification_type=NotificationType.TASK_ASSIGNED,
    )
    await db.commit()
    await db.refresh(object_task)
    return object_task


async def start_object_task(
    db: AsyncSession,
    *,
    object_task: ObjectTask,
    current_user: User,
) -> ObjectTask:
    if not _can_manage_task(object_task, current_user):
        raise HTTPException(status_code=403, detail="You cannot start this task.")
    _require_task_status(
        object_task,
        {ObjectTaskStatus.TODO, ObjectTaskStatus.REJECTED},
    )
    _set_task_status(object_task, ObjectTaskStatus.IN_PROGRESS)
    object_task.rejection_reason = None
    object_task.reviewed_at = None
    object_task.reviewed_by_id = None
    object_task.version += 1
    await db.commit()
    await db.refresh(object_task)
    return object_task


async def submit_object_task(
    db: AsyncSession,
    *,
    object_task: ObjectTask,
    current_user: User,
) -> ObjectTask:
    if not _can_manage_task(object_task, current_user):
        raise HTTPException(status_code=403, detail="You cannot submit this task.")
    _require_task_status(object_task, {ObjectTaskStatus.IN_PROGRESS})
    _set_task_status(object_task, ObjectTaskStatus.PENDING_REVIEW)
    object_task.submitted_at = datetime.now(UTC)
    object_task.version += 1

    recipients = {object_task.reviewer_id} if object_task.reviewer_id else set()
    if not recipients:
        recipients = set(
            await db.scalars(
                select(User.id).where(
                    User.is_active.is_(True),
                    User.role.in_([UserRole.ADMIN, UserRole.CHIEF_ENGINEER]),
                )
            )
        )
    await create_notification(
        db,
        actor_user_id=current_user.id,
        object_id=object_task.object_id,
        recipient_ids=recipients,
        message=f'Задача "{object_task.title}" отправлена на проверку.',
        notification_type=NotificationType.TASK_SUBMITTED,
    )
    await db.commit()
    await db.refresh(object_task)
    return object_task


async def review_object_task(
    db: AsyncSession,
    *,
    object_task: ObjectTask,
    current_user: User,
    accepted: bool,
    rejection_reason: str | None = None,
) -> ObjectTask:
    if not _can_review_task(object_task, current_user):
        raise HTTPException(status_code=403, detail="You cannot review this task.")
    _require_task_status(object_task, {ObjectTaskStatus.PENDING_REVIEW})

    object_task.reviewed_at = datetime.now(UTC)
    object_task.reviewed_by_id = current_user.id
    object_task.reviewed_by = current_user
    object_task.version += 1
    if accepted:
        _set_task_status(
            object_task,
            ObjectTaskStatus.DONE,
            current_user=current_user,
        )
        object_task.rejection_reason = None
        notification_type = NotificationType.TASK_ACCEPTED
        message = f'Задача "{object_task.title}" принята.'
    else:
        _set_task_status(object_task, ObjectTaskStatus.REJECTED)
        object_task.rejection_reason = rejection_reason
        notification_type = NotificationType.TASK_REJECTED
        short_reason = (rejection_reason or "")[:160]
        message = f'Задача "{object_task.title}" возвращена: {short_reason}'

    recipients = {object_task.assigned_to_id} if object_task.assigned_to_id else set()
    await create_notification(
        db,
        actor_user_id=current_user.id,
        object_id=object_task.object_id,
        recipient_ids=recipients,
        message=message,
        notification_type=notification_type,
    )
    await db.commit()
    await db.refresh(object_task)
    return object_task


async def build_available_task_trees(
    db: AsyncSession,
    *,
    object_id: int,
) -> list[dict]:
    result = await db.execute(
        select(ObjectTask)
        .where(
            ObjectTask.object_id == object_id,
            ObjectTask.parent_id.is_(None),
            ObjectTask.is_active.is_(True),
            ObjectTask.status.notin_(BLOCKING_STATUSES),
        )
        .order_by(ObjectTask.sort_order, ObjectTask.id)
    )
    main_tasks = result.scalars().all()

    return [
        await build_available_task_tree(db, main_task=main_task)
        for main_task in main_tasks
    ]


async def get_progress(
    db: AsyncSession,
    *,
    object_id: int,
    root_task_id: int | None = None,
):
    stats = await get_task_stats(db, object_id=object_id, root_task_id=root_task_id)
    if stats["total"] == 0:
        return 0

    return stats["done"] * 100 // stats["total"]
