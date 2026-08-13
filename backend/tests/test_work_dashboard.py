from datetime import UTC, date, datetime, timedelta

from httpx import AsyncClient

from app.modules.tasks.stages import ProjectStage
from app.modules.users.models import UserRole
from tests.conftest import auth_headers, login


def object_payload() -> dict:
    return {
        "name": "Dashboard object",
        "address": "Dashboard address",
        "is_active": True,
        "start_date": date(2026, 1, 1).isoformat(),
        "end_date": None,
    }


async def test_summary_and_current_step_include_actionable_task(
    client: AsyncClient,
    create_test_user,
    create_task_template,
) -> None:
    admin = await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    foreman = await create_test_user(email="foreman@example.com", role=UserRole.FOREMAN)
    root = await create_task_template(
        title="Contract",
        source_id="contract-root",
        stage=ProjectStage.CONTRACT_START,
    )
    await create_task_template(
        title="Sign contract",
        parent_id=root.id,
        source_id="sign-contract",
        parent_source_id=root.source_id,
        depth=1,
        stage=ProjectStage.CONTRACT_START,
    )
    token = await login(client, email=admin.email)
    object_id = (
        await client.post(
            "/api/v1/objects",
            headers=auth_headers(token),
            json=object_payload(),
        )
    ).json()["id"]
    await client.post(
        f"/api/v1/objects/{object_id}/assign/{foreman.id}",
        headers=auth_headers(token),
    )
    await client.patch(
        f"/api/v1/objects/{object_id}/assign/{foreman.id}/responsible",
        headers=auth_headers(token),
    )
    tasks = (
        await client.get(
            f"/api/v1/objects/{object_id}/tasks",
            headers=auth_headers(token),
        )
    ).json()
    child = next(task for task in tasks if task["title"] == "Sign contract")
    await client.patch(
        f"/api/v1/objects/{object_id}/tasks/{child['id']}/assignment",
        headers=auth_headers(token),
        json={
            "assigned_to_id": foreman.id,
            "reviewer_id": admin.id,
            "expected_version": child["version"],
        },
    )

    step_response = await client.get(
        f"/api/v1/objects/{object_id}/current-step",
        headers=auth_headers(token),
    )
    summary_response = await client.get(
        "/api/v1/objects/summary",
        headers=auth_headers(token),
    )

    assert step_response.status_code == 200
    assert step_response.json()["task"]["id"] == child["id"]
    assert step_response.json()["stage"] == "contract_start"
    summary = summary_response.json()[0]
    assert summary["current_step"]["task"]["id"] == child["id"]
    assert summary["responsible_users"][0]["id"] == foreman.id


async def test_my_and_today_tasks_return_only_current_user_work(
    client: AsyncClient,
    create_test_user,
    create_task_template,
) -> None:
    admin = await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    foreman = await create_test_user(email="foreman@example.com", role=UserRole.FOREMAN)
    await create_task_template(title="Assigned work", source_id="assigned-work")
    token = await login(client, email=admin.email)
    object_id = (
        await client.post(
            "/api/v1/objects",
            headers=auth_headers(token),
            json=object_payload(),
        )
    ).json()["id"]
    await client.post(
        f"/api/v1/objects/{object_id}/assign/{foreman.id}",
        headers=auth_headers(token),
    )
    task = (
        await client.get(
            f"/api/v1/objects/{object_id}/tasks",
            headers=auth_headers(token),
        )
    ).json()[0]
    await client.patch(
        f"/api/v1/objects/{object_id}/tasks/{task['id']}/assignment",
        headers=auth_headers(token),
        json={
            "assigned_to_id": foreman.id,
            "reviewer_id": admin.id,
            "expected_version": task["version"],
        },
    )
    await client.patch(
        f"/api/v1/objects/{object_id}/tasks/{task['id']}",
        headers=auth_headers(token),
        json={"deadline": (datetime.now(UTC) + timedelta(hours=2)).isoformat()},
    )
    foreman_token = await login(client, email=foreman.email)

    my_response = await client.get(
        "/api/v1/tasks/my",
        headers=auth_headers(foreman_token),
    )
    today_response = await client.get(
        "/api/v1/tasks/today",
        headers=auth_headers(foreman_token),
    )

    assert my_response.status_code == 200
    assert my_response.json()["total"] == 1
    assert my_response.json()["items"][0]["object_name"] == "Dashboard object"
    assert today_response.status_code == 200
    assert today_response.json()["total"] == 1
    assert today_response.json()["items"][0]["flag"] == "due_soon"
