from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.modules.auth.models import AuthSession
from app.modules.objects.models import ObjectToUser
from app.modules.tasks.models import ObjectTask, ObjectTaskStatus
from app.modules.users.models import UserRole
from tests.conftest import auth_headers, login


async def test_admin_can_create_user_with_phone_number(
    client: AsyncClient,
    create_test_user,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    access_token = await login(client, email="admin@example.com")

    response = await client.post(
        "/api/v1/users",
        headers=auth_headers(access_token),
        json={
            "full_name": "Foreman User",
            "email": "foreman@example.com",
            "phone_number": "+7 999 123-45-67",
            "password": "password123",
            "role": "foreman",
            "is_active": True,
        },
    )

    assert response.status_code == 201
    assert response.json()["phone_number"] == "+7 999 123-45-67"


async def test_create_user_rejects_invalid_phone_number(
    client: AsyncClient,
    create_test_user,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    access_token = await login(client, email="admin@example.com")

    response = await client.post(
        "/api/v1/users",
        headers=auth_headers(access_token),
        json={
            "full_name": "Foreman User",
            "email": "foreman@example.com",
            "phone_number": "(546)14 601.934 772115 48-6(704",
            "password": "password123",
            "role": "foreman",
            "is_active": True,
        },
    )

    assert response.status_code == 422


async def test_non_admin_cannot_create_user(
    client: AsyncClient,
    create_test_user,
) -> None:
    await create_test_user(email="foreman@example.com", role=UserRole.FOREMAN)
    access_token = await login(client, email="foreman@example.com")

    response = await client.post(
        "/api/v1/users",
        headers=auth_headers(access_token),
        json={
            "full_name": "Other User",
            "email": "other@example.com",
            "password": "password123",
            "role": "foreman",
            "is_active": True,
        },
    )

    assert response.status_code == 403


async def test_user_cannot_change_own_role_or_active_status(
    client: AsyncClient,
    create_test_user,
) -> None:
    user = await create_test_user(
        email="foreman@example.com",
        role=UserRole.FOREMAN,
    )
    access_token = await login(client, email="foreman@example.com")

    role_response = await client.patch(
        f"/api/v1/users/{user.id}",
        headers=auth_headers(access_token),
        json={"role": "admin"},
    )
    active_response = await client.patch(
        f"/api/v1/users/{user.id}",
        headers=auth_headers(access_token),
        json={"is_active": False},
    )

    assert role_response.status_code == 403
    assert active_response.status_code == 403


async def test_admin_cannot_deactivate_own_account_with_update(
    client: AsyncClient,
    create_test_user,
) -> None:
    admin = await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    access_token = await login(client, email="admin@example.com")

    response = await client.patch(
        f"/api/v1/users/{admin.id}",
        headers=auth_headers(access_token),
        json={"is_active": False},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "You cannot deactivate your own account."


async def test_admin_cannot_deactivate_own_account_with_endpoint(
    client: AsyncClient,
    create_test_user,
) -> None:
    admin = await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    access_token = await login(client, email="admin@example.com")

    response = await client.patch(
        f"/api/v1/users/{admin.id}/deactivate",
        headers=auth_headers(access_token),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "You cannot deactivate your own account."


async def test_admin_cannot_delete_own_account(
    client: AsyncClient,
    create_test_user,
) -> None:
    admin = await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    access_token = await login(client, email="admin@example.com")

    response = await client.delete(
        f"/api/v1/users/{admin.id}",
        headers=auth_headers(access_token),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "You cannot delete your own account."


async def test_deactivating_user_removes_active_assignments_but_keeps_history(
    client: AsyncClient,
    create_test_user,
    create_test_object,
    session_factory: async_sessionmaker[AsyncSession],
) -> None:
    admin = await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    user = await create_test_user(email="foreman@example.com", role=UserRole.FOREMAN)
    obj = await create_test_object()

    async with session_factory() as db:
        db.add(ObjectToUser(object_id=obj.id, user_id=user.id, is_responsible=True))
        active_task = ObjectTask(
            object_id=obj.id,
            title="Active task",
            depth=0,
            sort_order=0,
            status=ObjectTaskStatus.IN_PROGRESS,
            assigned_to_id=user.id,
        )
        completed_task = ObjectTask(
            object_id=obj.id,
            title="Completed task",
            depth=0,
            sort_order=1,
            status=ObjectTaskStatus.DONE,
            assigned_to_id=user.id,
            completed_by_id=user.id,
        )
        db.add_all([active_task, completed_task])
        await db.commit()
        active_task_id = active_task.id
        completed_task_id = completed_task.id

    await login(client, email="foreman@example.com")
    admin_token = await login(client, email=admin.email)
    response = await client.patch(
        f"/api/v1/users/{user.id}/deactivate",
        headers=auth_headers(admin_token),
    )

    assert response.status_code == 204

    async with session_factory() as db:
        deactivated_user = await db.get(type(user), user.id)
        object_assignment = await db.scalar(
            select(ObjectToUser).where(ObjectToUser.user_id == user.id)
        )
        active_task = await db.get(ObjectTask, active_task_id)
        completed_task = await db.get(ObjectTask, completed_task_id)
        session = await db.scalar(
            select(AuthSession).where(AuthSession.user_id == user.id)
        )

        assert deactivated_user is not None
        assert deactivated_user.is_active is False
        assert object_assignment is None
        assert active_task is not None
        assert active_task.assigned_to_id is None
        assert active_task.status == ObjectTaskStatus.TODO
        assert completed_task is not None
        assert completed_task.assigned_to_id is None
        assert completed_task.status == ObjectTaskStatus.DONE
        assert completed_task.completed_by_id == user.id
        assert session is not None
        assert session.revoked_at is not None
