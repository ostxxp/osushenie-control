from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.notifications.models import (
    NotificationReads,
    Notifications,
    NotificationType,
)


async def create_notification(
    db: AsyncSession,
    *,
    actor_user_id: int | None,
    object_id: int,
    recipient_ids: set[int],
    message: str,
    notification_type: NotificationType,
) -> Notifications | None:
    recipients = {recipient_id for recipient_id in recipient_ids if recipient_id > 0}
    if not recipients:
        return None

    notification = Notifications(
        user_id=actor_user_id,
        object_id=object_id,
        message=message,
        type=notification_type,
    )
    db.add(notification)
    await db.flush()

    for recipient_id in recipients:
        db.add(
            NotificationReads(
                notification_id=notification.id,
                user_id=recipient_id,
            )
        )

    return notification
