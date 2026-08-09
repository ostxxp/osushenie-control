from datetime import date

from httpx import AsyncClient

from app.modules.users.models import UserRole
from tests.conftest import auth_headers, login


def object_payload() -> dict:
    return {
        "name": "Sync object",
        "address": "Sync address",
        "is_active": True,
        "start_date": date(2026, 1, 1).isoformat(),
        "end_date": None,
    }


async def test_task_sync_is_idempotent_and_reports_conflicts(
    client: AsyncClient,
    create_test_user,
    create_task_template,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    await create_task_template(title="Offline task", source_id="offline-task")
    token = await login(client, email="admin@example.com")
    object_id = (
        await client.post(
            "/api/v1/objects",
            headers=auth_headers(token),
            json=object_payload(),
        )
    ).json()["id"]
    task = (
        await client.get(
            f"/api/v1/objects/{object_id}/tasks",
            headers=auth_headers(token),
        )
    ).json()[0]
    payload = {
        "operations": [
            {
                "operation_id": "device-1-operation-1",
                "task_id": task["id"],
                "status": "done",
                "expected_version": task["version"],
            }
        ]
    }

    first_response = await client.post(
        "/api/v1/tasks/sync",
        headers=auth_headers(token),
        json=payload,
    )
    duplicate_response = await client.post(
        "/api/v1/tasks/sync",
        headers=auth_headers(token),
        json=payload,
    )
    conflict_response = await client.post(
        "/api/v1/tasks/sync",
        headers=auth_headers(token),
        json={
            "operations": [
                {
                    "operation_id": "device-1-operation-2",
                    "task_id": task["id"],
                    "status": "todo",
                    "expected_version": task["version"],
                }
            ]
        },
    )

    first_result = first_response.json()["results"][0]
    assert first_response.status_code == 200
    assert first_result["outcome"] == "applied"
    assert first_result["resulting_version"] == task["version"] + 1
    assert duplicate_response.json()["results"][0] == first_result
    assert conflict_response.json()["results"][0]["outcome"] == "conflict"
    assert conflict_response.json()["results"][0]["resulting_version"] == first_result["resulting_version"]
