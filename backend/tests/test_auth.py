from httpx import AsyncClient

from app.modules.auth.service import get_access_token_expires_in
from app.modules.users.models import UserRole
from tests.conftest import auth_headers, login


async def test_login_sets_refresh_cookie_and_returns_access_token(
    client: AsyncClient,
    create_test_user,
) -> None:
    await create_test_user(
        email="admin@example.com",
        role=UserRole.ADMIN,
    )

    response = await client.post(
        "/api/v1/auth/login",
        data={
            "username": "admin@example.com",
            "password": "password123",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == get_access_token_expires_in()
    assert "refresh_token=" in response.headers["set-cookie"]
    assert "HttpOnly" in response.headers["set-cookie"]


async def test_login_rejects_invalid_password(
    client: AsyncClient,
    create_test_user,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)

    response = await client.post(
        "/api/v1/auth/login",
        data={
            "username": "admin@example.com",
            "password": "wrong-password",
        },
    )

    assert response.status_code == 401


async def test_refresh_rotates_access_token(
    client: AsyncClient,
    create_test_user,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    first_access_token = await login(client, email="admin@example.com")

    response = await client.post("/api/v1/auth/refresh")

    assert response.status_code == 200
    second_access_token = response.json()["access_token"]
    assert second_access_token
    assert second_access_token != first_access_token
    assert "refresh_token=" in response.headers["set-cookie"]


async def test_logout_revokes_current_session(
    client: AsyncClient,
    create_test_user,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    access_token = await login(client, email="admin@example.com")

    logout_response = await client.post(
        "/api/v1/auth/logout",
        headers=auth_headers(access_token),
    )
    me_response = await client.get(
        "/api/v1/users/me",
        headers=auth_headers(access_token),
    )
    refresh_response = await client.post("/api/v1/auth/refresh")

    assert logout_response.status_code == 204
    assert me_response.status_code == 401
    assert refresh_response.status_code == 401


async def test_inactive_user_cannot_login(
    client: AsyncClient,
    create_test_user,
) -> None:
    await create_test_user(
        email="inactive@example.com",
        role=UserRole.ADMIN,
        is_active=False,
    )

    response = await client.post(
        "/api/v1/auth/login",
        data={
            "username": "inactive@example.com",
            "password": "password123",
        },
    )

    assert response.status_code == 403
