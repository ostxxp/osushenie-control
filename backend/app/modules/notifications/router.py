from app.modules.users.schemas import UserRead
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session

from app.modules.objects.models import ConstructionObject, ObjectToUser

from sqlalchemy import func, select

from app.modules.objects.dependencies import get_object_or_404, get_object_to_user_or_404

from app.modules.notifications.models import Notifications
from app.modules.notifications.schemas import NotificationBase, NotificationRead

from app.modules.users.dependencies import get_current_auth_user, require_admin, get_user_or_404
from app.modules.users.dependencies import require_chief_engineer_or_admin, require_logged_in_user
from app.modules.users.models import User
from app.modules.objects.service import set_responsible_status
from app.modules.tasks.service import copy_task_templates_to_object


router = APIRouter()


@router.get(
    "", response_model=list[NotificationRead],
    summary="Get a list of notifications",
    dependencies=[Depends(require_admin)]
)
async def list_notifications(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user)
):
    query = select(Notifications).where(Notifications.user_id == user.id).order_by(Notifications.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

@router.get(
    "/unread", response_model=list[NotificationRead],
    summary="Get a list of unread notifications",
    dependencies=[Depends(require_admin)]
)
async def list_unread_notifications(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user)
):
    query = select(Notifications).where(Notifications.user_id == user.id, Notifications.is_read == False).order_by(Notifications.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

@router.get(
    "/unread-count", summary="Get count of unread notifications",
    dependencies=[Depends(require_admin)]
)
async def get_unread_notifications_count(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user)
):
    query = select(func.count(Notifications.id)).where(Notifications.user_id == user.id, Notifications.is_read == False)
    result = await db.execute(query)
    return result.scalar_one()

@router.patch(
    "/{notification_id}/read", response_model=NotificationRead,
    summary="Mark a notification as read",
    dependencies=[Depends(require_admin)]
)
async def mark_notification_as_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user)
):
    query = select(Notifications).where(Notifications.id == notification_id, Notifications.user_id == user.id)
    result = await db.execute(query)
    notification = result.scalar_one_or_none()

    if notification is None:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_read = True
    await db.commit()
    await db.refresh(notification)
    return notification

@router.patch(
    "", response_model=list[NotificationRead],
    summary="Mark all notifications as read",
    dependencies=[Depends(require_admin)]
)
async def mark_all_notifications_as_read(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user)
):
    query = select(Notifications).where(Notifications.user_id == user.id, Notifications.is_read == False)
    result = await db.execute(query)
    notifications = result.scalars().all()

    for notification in notifications:
        notification.is_read = True

    await db.commit()
    return notifications

@router.delete(
    "", status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete all notifications",
    dependencies=[Depends(require_admin)]
)
async def delete_all_notifications(
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user)
):
    query = select(Notifications).where(Notifications.user_id == user.id)
    result = await db.execute(query)
    notifications = result.scalars().all()

    for notification in notifications:
        await db.delete(notification)

    await db.commit()

@router.delete(
    "/{notification_id}", status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a notification",
    dependencies=[Depends(require_admin)]
)
async def delete_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db_session),
    user: User = Depends(get_current_auth_user)
):
    query = select(Notifications).where(Notifications.id == notification_id, Notifications.user_id == user.id)
    result = await db.execute(query)
    notification = result.scalar_one_or_none()

    if notification is None:
        raise HTTPException(status_code=404, detail="Notification not found")

    await db.delete(notification)
    await db.commit()