from datetime import UTC, datetime

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
from app.modules.notifications.models import Notifications, NotificationReads as NotificationReceipt
from app.modules.tasks.schemas import ObjectTaskCreate, ObjectTaskUpdate
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
            "status": task.status,
            "deadline": task.deadline,
            "is_active": task.is_active,
            "completed_at": task.completed_at,
            "completed_by_id": task.completed_by_id,
            "completed_by": completed_by_map.get(task.completed_by_id),
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

    for field in ("title", "sort_order", "children_mode", "is_active", "deadline"):
        if field in update_data:
            setattr(object_task, field, update_data[field])

    construction_object = await db.get(ConstructionObject, object_task.object_id)
    object_name = construction_object.name if construction_object is not None else str(object_task.object_id)
    
    if "status" in update_data:
        notification_message = f'Статус задачи "{object_task.title}" был изменен на "{object_task.status}".'
        if task_data.status == ObjectTaskStatus.DONE:
            notification_message = f'Задача "{object_task.title}" была выполнена.'
        elif task_data.status == ObjectTaskStatus.TODO:
            notification_message = f'Задача "{object_task.title}" была возвращена в статус "К выполнению".'
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


def _empty_task_stats() -> dict[str, int]:
    return {
        "total": 0,
        "done": 0,
        "todo": 0,
        "in_progress": 0,
        "overdue": 0,
    }


def _is_task_overdue(task: ObjectTask) -> bool:
    return (
        task.deadline is not None
        and task.deadline < datetime.now(UTC)
        and task.status != ObjectTaskStatus.DONE
    )


def _add_status_to_stats(
    stats: dict[str, int],
    status: ObjectTaskStatus,
    *,
    is_overdue: bool = False,
) -> None:
    if status == ObjectTaskStatus.DONE or status in BLOCKING_STATUSES:
        stats["done"] += 1
    elif status == ObjectTaskStatus.IN_PROGRESS:
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
    if any(task.status == ObjectTaskStatus.IN_PROGRESS for task in active_tasks):
        return ObjectTaskStatus.IN_PROGRESS
    if not active_tasks:
        return ObjectTaskStatus.DONE
    return ObjectTaskStatus.TODO


async def get_task_stats(
    db: AsyncSession,
    *,
    object_id: int,
) -> dict[str, int]:
    tasks = await _list_active_object_tasks(db, object_id=object_id)
    children_by_parent_id = _group_tasks_by_parent_id(tasks)
    stats = _empty_task_stats()

    def count_total_task(task: ObjectTask) -> int:
        children = children_by_parent_id.get(task.id, [])
        if task.parent_id is None and children:
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
        if task.parent_id is None and children:
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
        if task.parent_id is None and children:
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
        for root in children_by_parent_id.get(None, [])
    )

    for root in children_by_parent_id.get(None, []):
        count_task(root)

    return stats


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
            "status": task.status,
            "deadline": task.deadline,
            "days_until_deadline": (task.deadline - datetime.now(UTC)).days if task.deadline is not None else None,
            "is_overdue": task.deadline is not None and task.deadline < datetime.now(UTC) and task.status != ObjectTaskStatus.DONE,
            "is_active": task.is_active,
            "completed_at": task.completed_at,
            "completed_by_id": task.completed_by_id,
            "completed_by": completed_by_map.get(task.completed_by_id),
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
):
    stats = await get_task_stats(db, object_id=object_id)
    if stats["total"] == 0:
        return 0

    return stats["done"] * 100 // stats["total"]
