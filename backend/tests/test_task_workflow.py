from datetime import date

from httpx import AsyncClient

from app.modules.users.models import UserRole
from app.modules.tasks.models import TaskChildrenMode
from tests.conftest import auth_headers, login


def object_payload() -> dict:
    return {
        "name": "Workflow object",
        "address": "Test address",
        "is_active": True,
        "start_date": date(2026, 1, 1).isoformat(),
        "end_date": None,
    }


async def test_assigned_task_can_be_started_and_completed(
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
        json={
            "assigned_to_id": foreman.id,
            "expected_version": 1,
        },
    )
    start_response = await client.post(
        f"/api/v1/objects/{object_id}/tasks/{task_id}/start",
        headers=auth_headers(foreman_token),
        json={"expected_version": assignment_response.json()["version"]},
    )
    complete_response = await client.post(
        f"/api/v1/objects/{object_id}/tasks/{task_id}/complete",
        headers=auth_headers(foreman_token),
        json={"expected_version": start_response.json()["version"]},
    )
    notifications_response = await client.get(
        "/api/v1/notifications",
        headers=auth_headers(admin_token),
    )

    assert assignment_response.status_code == 200
    assert assignment_response.json()["assigned_to_id"] == foreman.id
    assert start_response.json()["status"] == "in_progress"
    assert complete_response.status_code == 200
    assert complete_response.json()["status"] == "done"
    assert complete_response.json()["completed_by_id"] == foreman.id
    assert notifications_response.status_code == 200
    assert {
        notification["type"]
        for notification in notifications_response.json()
    } >= {"task_status_changed"}


async def test_assigned_task_workflow_cannot_be_bypassed(
    client: AsyncClient,
    create_test_user,
    create_task_template,
) -> None:
    admin = await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    other_foreman = await create_test_user(
        email="chief@example.com",
        role=UserRole.FOREMAN,
    )
    foreman = await create_test_user(
        email="foreman@example.com",
        role=UserRole.FOREMAN,
    )
    await create_task_template(title="Protected task", source_id="protected-task")
    admin_token = await login(client, email=admin.email)
    other_foreman_token = await login(client, email=other_foreman.email)
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
    await client.post(
        f"/api/v1/objects/{object_id}/assign/{other_foreman.id}",
        headers=auth_headers(admin_token),
    )
    task = (
        await client.get(
            f"/api/v1/objects/{object_id}/tasks",
            headers=auth_headers(admin_token),
        )
    ).json()[0]
    assigned = await client.patch(
        f"/api/v1/objects/{object_id}/tasks/{task['id']}/assignment",
        headers=auth_headers(admin_token),
        json={
            "assigned_to_id": foreman.id,
            "expected_version": task["version"],
        },
    )

    direct_done = await client.patch(
        f"/api/v1/objects/{object_id}/tasks/{task['id']}/status",
        headers=auth_headers(foreman_token),
        json={"status": "done"},
    )
    stale_start = await client.post(
        f"/api/v1/objects/{object_id}/tasks/{task['id']}/start",
        headers=auth_headers(foreman_token),
        json={"expected_version": task["version"]},
    )
    started = await client.post(
        f"/api/v1/objects/{object_id}/tasks/{task['id']}/start",
        headers=auth_headers(foreman_token),
        json={"expected_version": assigned.json()["version"]},
    )
    wrong_executor = await client.post(
        f"/api/v1/objects/{object_id}/tasks/{task['id']}/complete",
        headers=auth_headers(other_foreman_token),
        json={"expected_version": started.json()["version"]},
    )

    assert direct_done.status_code == 409
    assert stale_start.status_code == 409
    assert wrong_executor.status_code == 403


async def test_task_cannot_be_completed_before_start(
    client: AsyncClient,
    create_test_user,
    create_task_template,
) -> None:
    admin = await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    foreman = await create_test_user(
        email="foreman@example.com",
        role=UserRole.FOREMAN,
    )
    await create_task_template(title="Unreviewed task", source_id="unreviewed-task")
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
    assigned = await client.patch(
        f"/api/v1/objects/{object_id}/tasks/{task['id']}/assignment",
        headers=auth_headers(admin_token),
        json={
            "assigned_to_id": foreman.id,
            "expected_version": task["version"],
        },
    )
    completed = await client.post(
        f"/api/v1/objects/{object_id}/tasks/{task['id']}/complete",
        headers=auth_headers(foreman_token),
        json={"expected_version": assigned.json()["version"]},
    )

    assert completed.status_code == 409


async def test_single_choice_branch_can_be_selected_switched_and_cleared(
    client: AsyncClient,
    create_test_user,
    create_task_template,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    root = await create_task_template(
        title="Есть рабочая документация?",
        source_id="documentation-choice",
        children_mode=TaskChildrenMode.SINGLE_CHOICE,
    )
    await create_task_template(
        title="Есть",
        parent_id=root.id,
        source_id="documentation-yes",
        parent_source_id=root.source_id,
        depth=1,
        sort_order=0,
    )
    await create_task_template(
        title="Нет",
        parent_id=root.id,
        source_id="documentation-no",
        parent_source_id=root.source_id,
        depth=1,
        sort_order=1,
    )
    token = await login(client, email="admin@example.com")
    create_response = await client.post(
        "/api/v1/objects",
        headers=auth_headers(token),
        json=object_payload(),
    )
    object_id = create_response.json()["id"]
    tasks = (
        await client.get(
            f"/api/v1/objects/{object_id}/tasks",
            headers=auth_headers(token),
        )
    ).json()
    root_task = next(task for task in tasks if task["parent_id"] is None)
    yes_task = next(task for task in tasks if task["title"] == "Есть")
    no_task = next(task for task in tasks if task["title"] == "Нет")

    select_yes_response = await client.put(
        f"/api/v1/objects/{object_id}/tasks/{root_task['id']}/branch",
        headers=auth_headers(token),
        json={
            "child_id": yes_task["id"],
            "expected_version": root_task["version"],
        },
    )
    select_no_response = await client.put(
        f"/api/v1/objects/{object_id}/tasks/{root_task['id']}/branch",
        headers=auth_headers(token),
        json={
            "child_id": no_task["id"],
            "expected_version": select_yes_response.json()["version"],
        },
    )
    selected_tasks = (
        await client.get(
            f"/api/v1/objects/{object_id}/tasks",
            headers=auth_headers(token),
        )
    ).json()
    clear_response = await client.delete(
        f"/api/v1/objects/{object_id}/tasks/{root_task['id']}/branch",
        headers=auth_headers(token),
    )
    cleared_tasks = (
        await client.get(
            f"/api/v1/objects/{object_id}/tasks",
            headers=auth_headers(token),
        )
    ).json()

    assert select_yes_response.status_code == 200
    assert select_yes_response.json()["selected_child_id"] == yes_task["id"]
    assert select_no_response.json()["selected_child_id"] == no_task["id"]
    assert next(task for task in selected_tasks if task["id"] == yes_task["id"])[
        "status"
    ] == "not_applicable"
    assert next(task for task in selected_tasks if task["id"] == no_task["id"])[
        "status"
    ] == "todo"
    assert clear_response.json()["selected_child_id"] is None
    assert {
        task["status"]
        for task in cleared_tasks
        if task["parent_id"] == root_task["id"]
    } == {"todo"}
