from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.objects.models import ConstructionObject, ObjectToUser
from app.modules.tasks.dependencies import get_object_task_or_404
from app.modules.tasks.models import ObjectTask, ObjectTaskStatus, TaskTemplate
from app.modules.tasks.schemas import ObjectTaskCreate, ObjectTaskUpdate
from app.modules.users.models import User

BLOCKING_STATUSES = {
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


def build_object_task_tree(tasks: list[ObjectTask]) -> list[dict]:
    nodes_by_id = {
        task.id: {
            "id": task.id,
            "object_id": task.object_id,
            "parent_id": task.parent_id,
            "template_id": task.template_id,
            "title": task.title,
            "depth": task.depth,
            "sort_order": task.sort_order,
            "status": task.status,
            "is_active": task.is_active,
            "completed_at": task.completed_at,
            "completed_by_id": task.completed_by_id,
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
        object_task.status = task_data.status
        if task_data.status == ObjectTaskStatus.DONE:
            object_task.completed_at = datetime.now(UTC)
            object_task.completed_by_id = current_user.id
        else:
            object_task.completed_at = None
            object_task.completed_by_id = None

    for field in ("title", "sort_order", "is_active"):
        if field in update_data:
            setattr(object_task, field, update_data[field])

    db.add(object_task)
    await db.commit()
    await db.refresh(object_task)
    return object_task


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
    async def serialize_until_blocker(task: ObjectTask) -> dict:
        node = {
            "id": task.id,
            "object_id": task.object_id,
            "parent_id": task.parent_id,
            "template_id": task.template_id,
            "title": task.title,
            "depth": task.depth,
            "sort_order": task.sort_order,
            "status": task.status,
            "is_active": task.is_active,
            "completed_at": task.completed_at,
            "completed_by_id": task.completed_by_id,
            "created_at": task.created_at,
            "updated_at": task.updated_at,
            "children": [],
        }

        if task.status in BLOCKING_STATUSES and task.parent_id is not None:
            return node

        result = await db.execute(
            select(ObjectTask)
            .where(
                ObjectTask.object_id == task.object_id,
                ObjectTask.parent_id == task.id,
                ObjectTask.is_active.is_(True),
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

async def get_progress(
    db: AsyncSession,
    *,
    object_id: int,
):
    result = await db.execute(
        select(ObjectTask.status, func.count(ObjectTask.id))
        .where(
            ObjectTask.object_id == object_id,
            ObjectTask.is_active.is_(True),
        )
        .group_by(ObjectTask.status)
    )
    status_counts = dict(result.all())

    total = sum(status_counts.values())
    if total == 0:
        return 0

    done_count = status_counts.get(ObjectTaskStatus.DONE, 0)
    return done_count * 100 // total