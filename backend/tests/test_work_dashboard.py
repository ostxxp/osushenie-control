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


async def test_current_step_prefers_task_with_active_workflow_status(
    client: AsyncClient,
    create_test_user,
    create_task_template,
) -> None:
    admin = await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    early_task = await create_task_template(
        title="Earlier todo",
        source_id="earlier-todo",
        stage=ProjectStage.CONTRACT_START,
    )
    active_task = await create_task_template(
        title="Actual current work",
        source_id="actual-current-work",
        stage=ProjectStage.PREPARATION_MOBILIZATION,
    )
    token = await login(client, email=admin.email)
    object_id = (
        await client.post(
            "/api/v1/objects",
            headers=auth_headers(token),
            json=object_payload(),
        )
    ).json()["id"]
    tasks = (
        await client.get(
            f"/api/v1/objects/{object_id}/tasks",
            headers=auth_headers(token),
        )
    ).json()
    early = next(task for task in tasks if task["template_id"] == early_task.id)
    active = next(task for task in tasks if task["template_id"] == active_task.id)

    assignment_response = await client.patch(
        f"/api/v1/objects/{object_id}/tasks/{active['id']}/assignment",
        headers=auth_headers(token),
        json={
            "assigned_to_id": admin.id,
            "expected_version": active["version"],
        },
    )
    start_response = await client.post(
        f"/api/v1/objects/{object_id}/tasks/{active['id']}/start",
        headers=auth_headers(token),
        json={"expected_version": assignment_response.json()["version"]},
    )
    step_response = await client.get(
        f"/api/v1/objects/{object_id}/current-step",
        headers=auth_headers(token),
    )

    assert start_response.status_code == 200
    assert early["status"] == "todo"
    assert step_response.status_code == 200
    assert step_response.json()["task"]["id"] == active["id"]
    assert step_response.json()["task"]["status"] == "in_progress"


async def test_current_step_follows_task_tree_execution_order(
    client: AsyncClient,
    create_test_user,
    create_task_template,
) -> None:
    admin = await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    root = await create_task_template(title="Section", source_id="section")
    first = await create_task_template(
        title="First task",
        parent_id=root.id,
        source_id="first-task",
        parent_source_id=root.source_id,
        depth=1,
        sort_order=1,
    )
    await create_task_template(
        title="Next nested task",
        parent_id=first.id,
        source_id="next-nested-task",
        parent_source_id=first.source_id,
        depth=2,
        sort_order=1,
    )
    await create_task_template(
        title="Later sibling",
        parent_id=root.id,
        source_id="later-sibling",
        parent_source_id=root.source_id,
        depth=1,
        sort_order=2,
    )
    token = await login(client, email=admin.email)
    object_id = (
        await client.post(
            "/api/v1/objects",
            headers=auth_headers(token),
            json=object_payload(),
        )
    ).json()["id"]
    tasks = (
        await client.get(
            f"/api/v1/objects/{object_id}/tasks",
            headers=auth_headers(token),
        )
    ).json()
    first_task = next(task for task in tasks if task["title"] == "First task")
    nested_task = next(task for task in tasks if task["title"] == "Next nested task")

    update_response = await client.patch(
        f"/api/v1/objects/{object_id}/tasks/{first_task['id']}/status",
        headers=auth_headers(token),
        json={"status": "done"},
    )
    step_response = await client.get(
        f"/api/v1/objects/{object_id}/current-step",
        headers=auth_headers(token),
    )

    assert update_response.status_code == 200
    assert step_response.status_code == 200
    assert step_response.json()["task"]["id"] == nested_task["id"]


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


async def test_my_tasks_include_object_assignment_and_tasks_completed_by_user(
    client: AsyncClient,
    create_test_user,
    create_task_template,
) -> None:
    admin = await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    foreman = await create_test_user(email="foreman@example.com", role=UserRole.FOREMAN)
    await create_task_template(title="Visible work", source_id="visible-work")
    admin_token = await login(client, email=admin.email)
    foreman_token = await login(client, email=foreman.email)

    object_ids = []
    for index in range(3):
        response = await client.post(
            "/api/v1/objects",
            headers=auth_headers(admin_token),
            json={**object_payload(), "name": f"Object {index + 1}"},
        )
        object_ids.append(response.json()["id"])

    assigned_object_id, completed_object_id, unrelated_object_id = object_ids
    await client.post(
        f"/api/v1/objects/{assigned_object_id}/assign/{foreman.id}",
        headers=auth_headers(admin_token),
    )
    assigned_tasks = (
        await client.get(
            f"/api/v1/objects/{assigned_object_id}/tasks",
            headers=auth_headers(admin_token),
        )
    ).json()
    assert assigned_tasks[0]["assigned_to_id"] is None

    await client.post(
        f"/api/v1/objects/{completed_object_id}/assign/{foreman.id}",
        headers=auth_headers(admin_token),
    )
    completed_task = (
        await client.get(
            f"/api/v1/objects/{completed_object_id}/tasks",
            headers=auth_headers(admin_token),
        )
    ).json()[0]
    assignment_response = await client.patch(
        f"/api/v1/objects/{completed_object_id}/tasks/{completed_task['id']}/assignment",
        headers=auth_headers(admin_token),
        json={
            "assigned_to_id": foreman.id,
            "expected_version": completed_task["version"],
        },
    )
    start_response = await client.post(
        f"/api/v1/objects/{completed_object_id}/tasks/{completed_task['id']}/start",
        headers=auth_headers(foreman_token),
        json={"expected_version": assignment_response.json()["version"]},
    )
    complete_response = await client.post(
        f"/api/v1/objects/{completed_object_id}/tasks/{completed_task['id']}/complete",
        headers=auth_headers(foreman_token),
        json={"expected_version": start_response.json()["version"]},
    )
    await client.patch(
        f"/api/v1/objects/{completed_object_id}/tasks/{completed_task['id']}/assignment",
        headers=auth_headers(admin_token),
        json={
            "assigned_to_id": None,
            "expected_version": complete_response.json()["version"],
        },
    )
    await client.delete(
        f"/api/v1/objects/{completed_object_id}/unassign/{foreman.id}",
        headers=auth_headers(admin_token),
    )

    response = await client.get(
        "/api/v1/tasks/my",
        headers=auth_headers(foreman_token),
    )

    assert response.status_code == 200
    assert response.json()["total"] == 2
    assert {item["object_id"] for item in response.json()["items"]} == {
        assigned_object_id,
        completed_object_id,
    }
    completed_item = next(
        item for item in response.json()["items"]
        if item["object_id"] == completed_object_id
    )
    assert completed_item["completed_by"]["id"] == foreman.id
    assert unrelated_object_id not in {
        item["object_id"] for item in response.json()["items"]
    }
