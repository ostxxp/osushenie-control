from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.objects.models import ConstructionObject
from app.modules.task_activity.models import TaskActivity, TaskActivityAction
from app.modules.tasks.models import ObjectTask, ObjectTaskStatus
from app.modules.users.models import User


async def record_task_activity(
    db: AsyncSession,
    *,
    task: ObjectTask,
    actor_user_id: int | None,
    action: TaskActivityAction,
    from_status: ObjectTaskStatus | None = None,
    to_status: ObjectTaskStatus | None = None,
    details: dict | None = None,
) -> TaskActivity:
    object_item = await db.get(ConstructionObject, task.object_id)
    activity = TaskActivity(
        object_id=task.object_id,
        task_id=task.id,
        actor_user_id=actor_user_id,
        object_name=object_item.name if object_item is not None else f"Object #{task.object_id}",
        task_title=task.title,
        action=action,
        from_status=from_status,
        to_status=to_status,
        details=details or {},
    )
    db.add(activity)
    return activity


async def list_task_activities(
    db: AsyncSession,
    *,
    object_id: int | None = None,
    task_id: int | None = None,
    actor_user_id: int | None = None,
    action: TaskActivityAction | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    filters = []
    if object_id is not None:
        filters.append(TaskActivity.object_id == object_id)
    if task_id is not None:
        filters.append(TaskActivity.task_id == task_id)
    if actor_user_id is not None:
        filters.append(TaskActivity.actor_user_id == actor_user_id)
    if action is not None:
        filters.append(TaskActivity.action == action)

    total = await db.scalar(select(func.count(TaskActivity.id)).where(*filters)) or 0
    result = await db.execute(
        select(TaskActivity, User.full_name)
        .outerjoin(User, User.id == TaskActivity.actor_user_id)
        .where(*filters)
        .order_by(TaskActivity.created_at.desc(), TaskActivity.id.desc())
        .limit(limit)
        .offset(offset)
    )
    items = [
        {
            "id": activity.id,
            "object_id": activity.object_id,
            "object_name": activity.object_name,
            "task_id": activity.task_id,
            "task_title": activity.task_title,
            "actor_user_id": activity.actor_user_id,
            "actor_full_name": actor_full_name,
            "action": activity.action,
            "from_status": activity.from_status,
            "to_status": activity.to_status,
            "details": activity.details,
            "created_at": activity.created_at,
        }
        for activity, actor_full_name in result.all()
    ]
    return {"items": items, "total": total, "limit": limit, "offset": offset}
