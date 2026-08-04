from datetime import date

from httpx import AsyncClient

from app.modules.users.models import UserRole
from tests.conftest import auth_headers, login


def object_payload() -> dict:
    return {
        "name": "Workflow object",
        "address": "Test address",
        "is_active": True,
        "start_date": date(2026, 1, 1).isoformat(),
        "end_date": None,
    }


async def test_assigned_task_can_be_submitted_rejected_and_accepted(
    client: AsyncClient,
    create_test_user,
    create_task_template,
) -> None:
    admin = await create_test_user(
        email="admin@example.com",
        role=UserRole.ADMIN,
    )
    foreman = await create_test_user(
        email="foreman@example.com",
        role=UserRole.FOREMAN,
    )
    await create_task_template(title="Inspect installation", source_id="inspection")
    admin_token = await login(client, email=admin.email)
    foreman_token = await login(client, email=foreman.email)

    create_response = await client.post(
        "/api/v1/objects",
        headers=auth_headers(admin_token),
        json=object_payload(),
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

    assignment_response = await client.patch(
        f"/api/v1/objects/{object_id}/tasks/{task_id}/assignment",
        headers=auth_headers(admin_token),
        json={"assigned_to_id": foreman.id, "reviewer_id": admin.id},
    )
    start_response = await client.post(
        f"/api/v1/objects/{object_id}/tasks/{task_id}/start",
        headers=auth_headers(foreman_token),
    )
    submit_response = await client.post(
        f"/api/v1/objects/{object_id}/tasks/{task_id}/submit",
        headers=auth_headers(foreman_token),
    )
    reject_response = await client.post(
        f"/api/v1/objects/{object_id}/tasks/{task_id}/reject",
        headers=auth_headers(admin_token),
        json={"reason": "Нужно приложить акт проверки"},
    )
    restart_response = await client.post(
        f"/api/v1/objects/{object_id}/tasks/{task_id}/start",
        headers=auth_headers(foreman_token),
    )
    await client.post(
        f"/api/v1/objects/{object_id}/tasks/{task_id}/submit",
        headers=auth_headers(foreman_token),
    )
    accept_response = await client.post(
        f"/api/v1/objects/{object_id}/tasks/{task_id}/accept",
        headers=auth_headers(admin_token),
    )
    notifications_response = await client.get(
        "/api/v1/notifications",
        headers=auth_headers(foreman_token),
    )

    assert assignment_response.status_code == 200
    assert assignment_response.json()["assigned_to_id"] == foreman.id
    assert assignment_response.json()["reviewer_id"] == admin.id
    assert start_response.json()["status"] == "in_progress"
    assert submit_response.json()["status"] == "pending_review"
    assert submit_response.json()["submitted_at"] is not None
    assert reject_response.json()["status"] == "rejected"
    assert reject_response.json()["rejection_reason"] == "Нужно приложить акт проверки"
    assert restart_response.json()["status"] == "in_progress"
    assert accept_response.json()["status"] == "done"
    assert accept_response.json()["reviewed_by_id"] == admin.id
    assert notifications_response.status_code == 200
    assert {
        notification["type"]
        for notification in notifications_response.json()
    } >= {"task_assigned", "task_rejected", "task_accepted"}
