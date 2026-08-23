import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.modules.notifications.models import NotificationType, TaskDeadlineAlert
from app.modules.notifications.service import create_notification
from app.modules.objects.models import ConstructionObject, ObjectToUser
from app.modules.tasks.models import ObjectTask, ObjectTaskStatus
from app.modules.users.models import User, UserRole


logger = logging.getLogger(__name__)

IGNORED_DEADLINE_STATUSES = {
    ObjectTaskStatus.DONE,
    ObjectTaskStatus.SKIPPED,
    ObjectTaskStatus.NOT_APPLICABLE,
}


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


async def _get_deadline_recipient_ids(
    db: AsyncSession,
    *,
    task: ObjectTask,
) -> set[int]:
    recipients = set(
        (
            await db.execute(
                select(User.id).where(
                    User.role.in_([UserRole.ADMIN, UserRole.CHIEF_ENGINEER]),
                    User.is_active.is_(True),
                )
            )
        ).scalars().all()
    )
    recipients.update(
        (
            await db.execute(
                select(ObjectToUser.user_id).where(
                    ObjectToUser.object_id == task.object_id,
                    ObjectToUser.is_responsible.is_(True),
                )
            )
        ).scalars().all()
    )
    if task.assigned_to_id is not None:
        recipients.add(task.assigned_to_id)
    return recipients


async def create_due_deadline_notifications(
    db: AsyncSession,
    *,
    now: datetime | None = None,
    due_soon_days: int | None = None,
) -> int:
    current_time = _as_utc(now or datetime.now(UTC))
    days = settings.DEADLINE_DUE_SOON_DAYS if due_soon_days is None else due_soon_days
    due_soon_limit = current_time + timedelta(days=max(days, 0))

    result = await db.execute(
        select(ObjectTask, ConstructionObject)
        .join(ConstructionObject, ConstructionObject.id == ObjectTask.object_id)
        .where(
            ObjectTask.is_active.is_(True),
            ObjectTask.deadline.is_not(None),
            ObjectTask.deadline <= due_soon_limit,
            ObjectTask.status.notin_(IGNORED_DEADLINE_STATUSES),
        )
        .order_by(ObjectTask.deadline, ObjectTask.id)
    )

    created_count = 0
    for task, obj in result.all():
        deadline = _as_utc(task.deadline)
        notification_type = (
            NotificationType.TASK_DEADLINE_OVERDUE
            if deadline < current_time
            else NotificationType.TASK_DEADLINE_DUE_SOON
        )
        existing_alert = await db.scalar(
            select(TaskDeadlineAlert.id).where(
                TaskDeadlineAlert.task_id == task.id,
                TaskDeadlineAlert.alert_type == notification_type,
                TaskDeadlineAlert.deadline == task.deadline,
            )
        )
        if existing_alert is not None:
            continue

        recipients = await _get_deadline_recipient_ids(db, task=task)
        if not recipients:
            continue

        formatted_deadline = deadline.strftime("%d.%m.%Y %H:%M")
        if notification_type == NotificationType.TASK_DEADLINE_OVERDUE:
            message = (
                f'Просрочена задача "{task.title}" на объекте "{obj.name}". '
                f"Срок: {formatted_deadline}."
            )
        else:
            message = (
                f'Приближается срок задачи "{task.title}" на объекте "{obj.name}". '
                f"Срок: {formatted_deadline}."
            )

        await create_notification(
            db,
            actor_user_id=None,
            object_id=task.object_id,
            recipient_ids=recipients,
            message=message,
            notification_type=notification_type,
        )
        db.add(
            TaskDeadlineAlert(
                task_id=task.id,
                alert_type=notification_type,
                deadline=task.deadline,
            )
        )
        created_count += 1

    await db.commit()
    return created_count


async def deadline_notification_loop() -> None:
    interval = max(settings.DEADLINE_NOTIFICATION_INTERVAL_SECONDS, 30)
    while True:
        try:
            async with AsyncSessionLocal() as db:
                await create_due_deadline_notifications(db)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Deadline notification scan failed")
        await asyncio.sleep(interval)
