from datetime import date

from httpx import AsyncClient

from app.modules.users.models import UserRole
from tests.conftest import auth_headers, login


def object_payload() -> dict:
    return {
        "name": "Activity object",
        "address": "Activity address",
        "is_active": True,
        "start_date": date(2026, 1, 1).isoformat(),
        "end_date": None,
    }


async def test_task_activity_is_recorded_filtered_and_paginated(
    client: AsyncClient,
    create_test_user,
    create_task_template,
) -> None:
    admin = await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    foreman = await create_test_user(email="foreman@example.com", role=UserRole.FOREMAN)
    await create_task_template(title="Recorded task", source_id="recorded-task")
    admin_token = await login(client, email=admin.email)
    foreman_token = await login(client, email=foreman.email)
    object_id = (
        await client.post(
            "/api/v1/objects",
            headers=auth_headers(admin_token),
            json=object_payload(),
        )
    ).json()["id"]
    await client.post(
        f"/api/v1/objects/{object_id}/assign/{foreman.id}",
        headers=auth_headers(admin_token),
    )
    task = (
        await client.get(
            f"/api/v1/objects/{object_id}/tasks",
            headers=auth_headers(admin_token),
        )
    ).json()[0]
    assignment_response = await client.patch(
        f"/api/v1/objects/{object_id}/tasks/{task['id']}/assignment",
        headers=auth_headers(admin_token),
        json={
            "assigned_to_id": foreman.id,
            "reviewer_id": admin.id,
            "expected_version": task["version"],
        },
    )
    await client.post(
        f"/api/v1/objects/{object_id}/tasks/{task['id']}/start",
        headers=auth_headers(foreman_token),
        json={"expected_version": assignment_response.json()["version"]},
    )

    first_page = await client.get(
        "/api/v1/activity?limit=1",
        headers=auth_headers(admin_token),
    )
    second_page = await client.get(
        "/api/v1/activity?limit=1&offset=1",
        headers=auth_headers(admin_token),
    )
    object_history = await client.get(
        f"/api/v1/objects/{object_id}/activity",
        headers=auth_headers(foreman_token),
    )

    assert first_page.status_code == 200
    assert first_page.json()["total"] == 2
    assert first_page.json()["items"][0]["action"] == "started"
    assert first_page.json()["items"][0]["actor_full_name"] == foreman.full_name
    assert second_page.json()["items"][0]["action"] == "assigned"
    assert object_history.status_code == 200
    assert object_history.json()["total"] == 2


async def test_foreman_cannot_read_global_activity(
    client: AsyncClient,
    create_test_user,
) -> None:
    foreman = await create_test_user(email="foreman@example.com", role=UserRole.FOREMAN)
    token = await login(client, email=foreman.email)

    response = await client.get(
        "/api/v1/activity",
        headers=auth_headers(token),
    )

    assert response.status_code == 403
