from datetime import UTC, datetime

from app.modules.users.schemas import UserRead
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session

from app.modules.objects.models import ConstructionObject, ObjectToUser

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.modules.objects.dependencies import get_object_or_404, get_object_to_user_or_404

from app.modules.notifications.models import Notifications
from app.modules.notifications.models import NotificationReads as NotificationReceipt
from app.modules.notifications.schemas import NotificationBase, NotificationRead

from app.modules.users.dependencies import get_current_auth_user, require_admin, get_user_or_404
from app.modules.users.dependencies import require_chief_engineer_or_admin, require_logged_in_user
from app.modules.users.models import User
from app.modules.objects.service import set_responsible_status
from app.modules.tasks.service import copy_task_templates_to_object


router = APIRouter()


def serialize_notification_receipt(receipt: NotificationReceipt) -> dict:
    notification = receipt.notification
    actor = notification.actor
    return {
        "id": notification.id,
        "receipt_id": receipt.id,
        "user_id": receipt.user_id,
        "actor_user_id": notification.user_id,
        "actor_full_name": actor.full_name if actor is not None else None,
        "object_id": notification.object_id,
        "message": notification.message,
        "type": notification.type,
        "is_read": receipt.is_read,
        "read_at": receipt.read_at,
        "created_at": notification.created_at,
    }


@router.get(
    "", response_model=list[NotificationRead],
    summary="Get a list of notifications",
    dependencies=[Depends(require_chief_engineer_or_admin)]
)
async def list_notifications(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user)
):
    query = (
        select(NotificationReceipt)
        .join(NotificationReceipt.notification)
        .options(
            selectinload(NotificationReceipt.notification).selectinload(Notifications.actor)
        )
        .where(NotificationReceipt.user_id == user.id)
        .order_by(Notifications.created_at.desc())
    )
    result = await db.execute(query)
    return [
        serialize_notification_receipt(receipt)
        for receipt in result.scalars().all()
    ]


@router.get(
    "/unread", response_model=list[NotificationRead],
    summary="Get a list of unread notifications",
    dependencies=[Depends(require_chief_engineer_or_admin)]
)
async def list_unread_notifications(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user)
):
    query = (
        select(NotificationReceipt)
        .join(NotificationReceipt.notification)
        .options(
            selectinload(NotificationReceipt.notification).selectinload(Notifications.actor)
        )
        .where(
            NotificationReceipt.user_id == user.id,
            NotificationReceipt.is_read.is_(False),
        )
        .order_by(Notifications.created_at.desc())
    )
    result = await db.execute(query)
    return [
        serialize_notification_receipt(receipt)
        for receipt in result.scalars().all()
    ]

@router.get(
    "/unread-count", summary="Get count of unread notifications",
    dependencies=[Depends(require_chief_engineer_or_admin)]
)
async def get_unread_notifications_count(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user)
):
    query = (
        select(func.count(NotificationReceipt.id))
        .where(
            NotificationReceipt.user_id == user.id,
            NotificationReceipt.is_read.is_(False),
        )
    )
    result = await db.execute(query)
    return result.scalar_one()

@router.patch(
    "/{notification_id}/read", response_model=NotificationRead,
    summary="Mark a notification as read",
    dependencies=[Depends(require_chief_engineer_or_admin)]
)
async def mark_notification_as_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user)
):
    query = (
        select(NotificationReceipt)
        .options(
            selectinload(NotificationReceipt.notification).selectinload(Notifications.actor)
        )
        .where(
            NotificationReceipt.notification_id == notification_id,
            NotificationReceipt.user_id == user.id
        )
    )
    result = await db.execute(query)
    notification = result.scalar_one_or_none()

    if notification is None:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_read = True
    notification.read_at = datetime.now(UTC)
    await db.commit()
    return serialize_notification_receipt(notification)

@router.patch(
    "", response_model=list[NotificationRead],
    summary="Mark all notifications as read",
    dependencies=[Depends(require_chief_engineer_or_admin)]
)
async def mark_all_notifications_as_read(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user)
):
    query = (
        select(NotificationReceipt)
        .options(
            selectinload(NotificationReceipt.notification).selectinload(Notifications.actor)
        )
        .where(
            NotificationReceipt.user_id == user.id,
            NotificationReceipt.is_read == False
        )
    )
    result = await db.execute(query)
    notifications = result.scalars().all()

    for notification in notifications:
        notification.is_read = True
        notification.read_at = datetime.now(UTC)

    await db.commit()
    return [
        serialize_notification_receipt(notification)
        for notification in notifications
    ]

@router.delete(
    "", status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete all notifications",
    dependencies=[Depends(require_chief_engineer_or_admin)]
)
async def delete_all_notifications(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user)
):
    query = select(NotificationReceipt).where(NotificationReceipt.user_id == user.id)
    result = await db.execute(query)
    notifications = result.scalars().all()

    for notification in notifications:
        await db.delete(notification)

    await db.commit()

@router.delete(
    "/{notification_id}", status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a notification",
    dependencies=[Depends(require_chief_engineer_or_admin)]
)
async def delete_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user)
):
    query = select(NotificationReceipt).where(
        NotificationReceipt.notification_id == notification_id,
        NotificationReceipt.user_id == user.id,
    )
    result = await db.execute(query)
    notification = result.scalar_one_or_none()

    if notification is None:
        raise HTTPException(status_code=404, detail="Notification not found")

    await db.delete(notification)
    await db.commit()
