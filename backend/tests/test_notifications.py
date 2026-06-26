from datetime import UTC, datetime

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modules.notifications.models import (
    NotificationReads,
    NotificationType,
    Notifications,
)
from app.modules.users.models import UserRole
from tests.conftest import auth_headers, login


def object_payload(name: str = "Object") -> dict:
    return {
        "name": name,
        "address": "Test address",
        "is_active": True,
        "start_date": "2026-01-01",
        "end_date": None,
    }


async def create_notification(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    actor_user_id: int,
    recipient_user_id: int,
    object_id: int,
    message: str = "Task status changed",
    is_read: bool = False,
) -> tuple[int, int]:
    async with session_factory() as session:
        notification = Notifications(
            user_id=actor_user_id,
            object_id=object_id,
            type=NotificationType.TASK_STATUS_CHANGED,
            message=message,
        )
        session.add(notification)
        await session.flush()

        receipt = NotificationReads(
            notification_id=notification.id,
            user_id=recipient_user_id,
            is_read=is_read,
            read_at=datetime.now(UTC) if is_read else None,
        )
        session.add(receipt)
        await session.commit()

        return notification.id, receipt.id


async def test_user_can_list_only_own_notifications(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    create_test_user,
    create_test_object,
) -> None:
    admin = await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    chief = await create_test_user(email="chief@example.com", role=UserRole.CHIEF_ENGINEER)
    other_chief = await create_test_user(
        email="other-chief@example.com",
        role=UserRole.CHIEF_ENGINEER,
    )
    obj = await create_test_object(name="ЖК Осел")
    notification_id, receipt_id = await create_notification(
        session_factory,
        actor_user_id=admin.id,
        recipient_user_id=chief.id,
        object_id=obj.id,
        message="Visible notification",
    )
    await create_notification(
        session_factory,
        actor_user_id=admin.id,
        recipient_user_id=other_chief.id,
        object_id=obj.id,
        message="Hidden notification",
    )
    chief_token = await login(client, email="chief@example.com")

    response = await client.get(
        "/api/v1/notifications",
        headers=auth_headers(chief_token),
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == notification_id
    assert body[0]["receipt_id"] == receipt_id
    assert body[0]["user_id"] == chief.id
    assert body[0]["actor_user_id"] == admin.id
    assert body[0]["actor_full_name"] == admin.full_name
    assert body[0]["object_id"] == obj.id
    assert body[0]["message"] == "Visible notification"
    assert body[0]["type"] == NotificationType.TASK_STATUS_CHANGED
    assert body[0]["is_read"] is False
    assert body[0]["read_at"] is None


async def test_unread_notifications_and_count_use_receipt_status(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    create_test_user,
    create_test_object,
) -> None:
    admin = await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    obj = await create_test_object()
    unread_id, _ = await create_notification(
        session_factory,
        actor_user_id=admin.id,
        recipient_user_id=admin.id,
        object_id=obj.id,
        message="Unread notification",
    )
    await create_notification(
        session_factory,
        actor_user_id=admin.id,
        recipient_user_id=admin.id,
        object_id=obj.id,
        message="Read notification",
        is_read=True,
    )
    admin_token = await login(client, email="admin@example.com")

    unread_response = await client.get(
        "/api/v1/notifications/unread",
        headers=auth_headers(admin_token),
    )
    count_response = await client.get(
        "/api/v1/notifications/unread-count",
        headers=auth_headers(admin_token),
    )

    assert unread_response.status_code == 200
    assert count_response.status_code == 200
    unread = unread_response.json()
    assert len(unread) == 1
    assert unread[0]["id"] == unread_id
    assert unread[0]["is_read"] is False
    assert count_response.json() == 1


async def test_mark_notification_as_read_updates_only_current_user_receipt(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    create_test_user,
    create_test_object,
) -> None:
    admin = await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    chief = await create_test_user(email="chief@example.com", role=UserRole.CHIEF_ENGINEER)
    obj = await create_test_object()
    notification_id, _ = await create_notification(
        session_factory,
        actor_user_id=admin.id,
        recipient_user_id=admin.id,
        object_id=obj.id,
    )
    async with session_factory() as session:
        session.add(
            NotificationReads(
                notification_id=notification_id,
                user_id=chief.id,
            )
        )
        await session.commit()
    admin_token = await login(client, email="admin@example.com")
    chief_token = await login(client, email="chief@example.com")

    response = await client.patch(
        f"/api/v1/notifications/{notification_id}/read",
        headers=auth_headers(admin_token),
    )
    admin_count_response = await client.get(
        "/api/v1/notifications/unread-count",
        headers=auth_headers(admin_token),
    )
    chief_count_response = await client.get(
        "/api/v1/notifications/unread-count",
        headers=auth_headers(chief_token),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == notification_id
    assert body["user_id"] == admin.id
    assert body["is_read"] is True
    assert body["read_at"] is not None
    assert admin_count_response.json() == 0
    assert chief_count_response.json() == 1


async def test_mark_all_notifications_as_read(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    create_test_user,
    create_test_object,
) -> None:
    chief = await create_test_user(email="chief@example.com", role=UserRole.CHIEF_ENGINEER)
    obj = await create_test_object()
    await create_notification(
        session_factory,
        actor_user_id=chief.id,
        recipient_user_id=chief.id,
        object_id=obj.id,
        message="First",
    )
    await create_notification(
        session_factory,
        actor_user_id=chief.id,
        recipient_user_id=chief.id,
        object_id=obj.id,
        message="Second",
    )
    chief_token = await login(client, email="chief@example.com")

    response = await client.patch(
        "/api/v1/notifications",
        headers=auth_headers(chief_token),
    )
    count_response = await client.get(
        "/api/v1/notifications/unread-count",
        headers=auth_headers(chief_token),
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    assert all(notification["is_read"] is True for notification in body)
    assert all(notification["read_at"] is not None for notification in body)
    assert count_response.json() == 0


async def test_delete_notification_removes_only_current_user_receipt(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    create_test_user,
    create_test_object,
) -> None:
    admin = await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    chief = await create_test_user(email="chief@example.com", role=UserRole.CHIEF_ENGINEER)
    obj = await create_test_object()
    notification_id, _ = await create_notification(
        session_factory,
        actor_user_id=admin.id,
        recipient_user_id=admin.id,
        object_id=obj.id,
    )
    async with session_factory() as session:
        session.add(NotificationReads(notification_id=notification_id, user_id=chief.id))
        await session.commit()
    admin_token = await login(client, email="admin@example.com")
    chief_token = await login(client, email="chief@example.com")

    delete_response = await client.delete(
        f"/api/v1/notifications/{notification_id}",
        headers=auth_headers(admin_token),
    )
    admin_list_response = await client.get(
        "/api/v1/notifications",
        headers=auth_headers(admin_token),
    )
    chief_list_response = await client.get(
        "/api/v1/notifications",
        headers=auth_headers(chief_token),
    )

    assert delete_response.status_code == 204
    assert admin_list_response.json() == []
    assert len(chief_list_response.json()) == 1
    assert chief_list_response.json()[0]["id"] == notification_id


async def test_delete_all_notifications_removes_only_current_user_receipts(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    create_test_user,
    create_test_object,
) -> None:
    admin = await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    chief = await create_test_user(email="chief@example.com", role=UserRole.CHIEF_ENGINEER)
    obj = await create_test_object()
    first_notification_id, _ = await create_notification(
        session_factory,
        actor_user_id=admin.id,
        recipient_user_id=admin.id,
        object_id=obj.id,
        message="First",
    )
    second_notification_id, _ = await create_notification(
        session_factory,
        actor_user_id=admin.id,
        recipient_user_id=admin.id,
        object_id=obj.id,
        message="Second",
    )
    async with session_factory() as session:
        session.add_all(
            [
                NotificationReads(
                    notification_id=first_notification_id,
                    user_id=chief.id,
                ),
                NotificationReads(
                    notification_id=second_notification_id,
                    user_id=chief.id,
                ),
            ]
        )
        await session.commit()
    admin_token = await login(client, email="admin@example.com")
    chief_token = await login(client, email="chief@example.com")

    delete_response = await client.delete(
        "/api/v1/notifications",
        headers=auth_headers(admin_token),
    )
    admin_list_response = await client.get(
        "/api/v1/notifications",
        headers=auth_headers(admin_token),
    )
    chief_list_response = await client.get(
        "/api/v1/notifications",
        headers=auth_headers(chief_token),
    )

    assert delete_response.status_code == 204
    assert admin_list_response.json() == []
    assert len(chief_list_response.json()) == 2


async def test_foreman_cannot_access_notifications(
    client: AsyncClient,
    create_test_user,
) -> None:
    await create_test_user(email="foreman@example.com", role=UserRole.FOREMAN)
    foreman_token = await login(client, email="foreman@example.com")

    response = await client.get(
        "/api/v1/notifications",
        headers=auth_headers(foreman_token),
    )

    assert response.status_code == 403


async def test_task_status_change_notifies_admins_and_chief_engineers(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    create_test_user,
    create_task_template,
) -> None:
    admin = await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    chief = await create_test_user(email="chief@example.com", role=UserRole.CHIEF_ENGINEER)
    foreman = await create_test_user(email="foreman@example.com", role=UserRole.FOREMAN)
    await create_task_template(title="Принят отделом ПТО", source_id="task-1")
    admin_token = await login(client, email="admin@example.com")

    create_response = await client.post(
        "/api/v1/objects",
        headers=auth_headers(admin_token),
        json=object_payload("ЖК Осел"),
    )
    object_id = create_response.json()["id"]
    await client.post(
        f"/api/v1/objects/{object_id}/assign/{foreman.id}",
        headers=auth_headers(admin_token),
    )
    tasks_response = await client.get(
        f"/api/v1/objects/{object_id}/tasks",
        headers=auth_headers(admin_token),
    )
    task_id = tasks_response.json()[0]["id"]
    foreman_token = await login(client, email="foreman@example.com")

    update_response = await client.patch(
        f"/api/v1/objects/{object_id}/tasks/{task_id}/status",
        headers=auth_headers(foreman_token),
        json={"status": "done"},
    )
    admin_notifications_response = await client.get(
        "/api/v1/notifications",
        headers=auth_headers(admin_token),
    )
    chief_token = await login(client, email="chief@example.com")
    chief_notifications_response = await client.get(
        "/api/v1/notifications",
        headers=auth_headers(chief_token),
    )

    assert update_response.status_code == 200
    assert admin_notifications_response.status_code == 200
    assert chief_notifications_response.status_code == 200
    admin_notifications = admin_notifications_response.json()
    chief_notifications = chief_notifications_response.json()
    assert len(admin_notifications) == 1
    assert len(chief_notifications) == 1
    assert admin_notifications[0]["user_id"] == admin.id
    assert chief_notifications[0]["user_id"] == chief.id
    assert admin_notifications[0]["actor_user_id"] == foreman.id
    assert admin_notifications[0]["actor_full_name"] == foreman.full_name
    assert chief_notifications[0]["actor_user_id"] == foreman.id
    assert chief_notifications[0]["actor_full_name"] == foreman.full_name
    assert admin_notifications[0]["message"] == (
        'Задача "Принят отделом ПТО" на объекте "ЖК Осел" была выполнена.'
    )
    assert admin_notifications[0]["type"] == NotificationType.TASK_STATUS_CHANGED
    assert admin_notifications[0]["is_read"] is False

    async with session_factory() as session:
        receipt_count = await session.scalar(select(func.count(NotificationReads.id)))
        notification_count = await session.scalar(select(func.count(Notifications.id)))

    assert receipt_count == 2
    assert notification_count == 1
