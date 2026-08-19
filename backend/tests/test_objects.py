from datetime import date

from httpx import AsyncClient

from app.modules.users.models import UserRole
from tests.conftest import auth_headers, login


def object_payload(name: str = "Object") -> dict:
    return {
        "name": name,
        "address": "Test address",
        "is_active": True,
        "start_date": date(2026, 1, 1).isoformat(),
        "end_date": None,
    }


async def test_admin_can_create_object(
    client: AsyncClient,
    create_test_user,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    access_token = await login(client, email="admin@example.com")

    response = await client.post(
        "/api/v1/objects",
        headers=auth_headers(access_token),
        json=object_payload(),
    )

    assert response.status_code == 201
    assert response.json()["name"] == "Object"


async def test_foreman_cannot_read_unassigned_object(
    client: AsyncClient,
    create_test_user,
    create_test_object,
) -> None:
    await create_test_user(email="foreman@example.com", role=UserRole.FOREMAN)
    obj = await create_test_object()
    access_token = await login(client, email="foreman@example.com")

    response = await client.get(
        f"/api/v1/objects/{obj.id}",
        headers=auth_headers(access_token),
    )

    assert response.status_code == 403


async def test_foreman_lists_only_assigned_objects(
    client: AsyncClient,
    create_test_user,
    create_test_object,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    foreman = await create_test_user(
        email="foreman@example.com",
        role=UserRole.FOREMAN,
    )
    assigned = await create_test_object(name="Assigned object")
    await create_test_object(name="Unassigned object")
    admin_token = await login(client, email="admin@example.com")

    assign_response = await client.post(
        f"/api/v1/objects/{assigned.id}/assign/{foreman.id}",
        headers=auth_headers(admin_token),
    )
    foreman_token = await login(client, email="foreman@example.com")
    list_response = await client.get(
        "/api/v1/objects",
        headers=auth_headers(foreman_token),
    )

    assert assign_response.status_code == 200
    assert list_response.status_code == 200
    objects = list_response.json()
    assert len(objects) == 1
    assert objects[0]["id"] == assigned.id


async def test_duplicate_object_assignment_is_rejected(
    client: AsyncClient,
    create_test_user,
    create_test_object,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    foreman = await create_test_user(
        email="foreman@example.com",
        role=UserRole.FOREMAN,
    )
    obj = await create_test_object()
    access_token = await login(client, email="admin@example.com")

    first_response = await client.post(
        f"/api/v1/objects/{obj.id}/assign/{foreman.id}",
        headers=auth_headers(access_token),
    )
    second_response = await client.post(
        f"/api/v1/objects/{obj.id}/assign/{foreman.id}",
        headers=auth_headers(access_token),
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 400


async def test_inactive_user_cannot_be_assigned_to_object(
    client: AsyncClient,
    create_test_user,
    create_test_object,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    inactive_user = await create_test_user(
        email="inactive@example.com",
        role=UserRole.FOREMAN,
        is_active=False,
    )
    obj = await create_test_object()
    access_token = await login(client, email="admin@example.com")

    response = await client.post(
        f"/api/v1/objects/{obj.id}/assign/{inactive_user.id}",
        headers=auth_headers(access_token),
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Неактивного пользователя нельзя назначить на объект."


async def test_inactive_user_cannot_be_made_responsible(
    client: AsyncClient,
    create_test_user,
    create_test_object,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    foreman = await create_test_user(
        email="foreman@example.com",
        role=UserRole.FOREMAN,
    )
    obj = await create_test_object()
    access_token = await login(client, email="admin@example.com")
    headers = auth_headers(access_token)

    assign_response = await client.post(
        f"/api/v1/objects/{obj.id}/assign/{foreman.id}",
        headers=headers,
    )
    deactivate_response = await client.patch(
        f"/api/v1/users/{foreman.id}",
        headers=headers,
        json={"is_active": False},
    )
    responsible_response = await client.patch(
        f"/api/v1/objects/{obj.id}/assign/{foreman.id}/responsible",
        headers=headers,
    )

    assert assign_response.status_code == 200
    assert deactivate_response.status_code == 200
    assert responsible_response.status_code == 400
    assert responsible_response.json()["detail"] == "Неактивного пользователя нельзя назначить ответственным."
