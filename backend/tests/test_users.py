from httpx import AsyncClient

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
