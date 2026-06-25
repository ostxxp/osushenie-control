from datetime import date, datetime, timedelta, timezone

from httpx import AsyncClient

from app.modules.tasks.models import ObjectTaskStatus, TaskChildrenMode
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


async def test_object_creation_copies_active_task_templates(
    client: AsyncClient,
    create_test_user,
    create_task_template,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    root_template = await create_task_template(
        title="Opening object",
        source_id="root-1",
        sort_order=0,
    )
    await create_task_template(
        title="Check documentation",
        parent_id=root_template.id,
        source_id="child-1",
        parent_source_id="root-1",
        depth=1,
        sort_order=0,
    )
    await create_task_template(
        title="Inactive task",
        source_id="inactive-1",
        sort_order=1,
        is_active=False,
    )
    access_token = await login(client, email="admin@example.com")

    create_response = await client.post(
        "/api/v1/objects",
        headers=auth_headers(access_token),
        json=object_payload(),
    )
    tasks_response = await client.get(
        f"/api/v1/objects/{create_response.json()['id']}/tasks",
        headers=auth_headers(access_token),
    )

    assert create_response.status_code == 201
    assert tasks_response.status_code == 200
    tasks = tasks_response.json()
    assert [task["title"] for task in tasks] == [
        "Opening object",
        "Check documentation",
    ]
    assert tasks[0]["parent_id"] is None
    assert tasks[1]["parent_id"] == tasks[0]["id"]
    assert tasks[0]["status"] == ObjectTaskStatus.TODO
    assert tasks[0]["children_mode"] == TaskChildrenMode.ALL


async def test_foreman_can_complete_assigned_object_task(
    client: AsyncClient,
    create_test_user,
    create_task_template,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    foreman = await create_test_user(
        email="foreman@example.com",
        role=UserRole.FOREMAN,
    )
    await create_task_template(title="Mount equipment", source_id="task-1")
    admin_token = await login(client, email="admin@example.com")

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
    foreman_token = await login(client, email="foreman@example.com")

    update_response = await client.patch(
        f"/api/v1/objects/{object_id}/tasks/{task_id}/status",
        headers=auth_headers(foreman_token),
        json={"status": "done"},
    )

    assert update_response.status_code == 200
    body = update_response.json()
    assert body["status"] == "done"
    assert body["main_task_id"] == task_id
    assert body["completed_by_id"] == foreman.id
    assert body["completed_at"] is not None


async def test_foreman_can_mark_task_not_applicable(
    client: AsyncClient,
    create_test_user,
    create_task_template,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    foreman = await create_test_user(
        email="foreman@example.com",
        role=UserRole.FOREMAN,
    )
    await create_task_template(title="Optional branch", source_id="task-1")
    admin_token = await login(client, email="admin@example.com")

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
    foreman_token = await login(client, email="foreman@example.com")

    update_response = await client.patch(
        f"/api/v1/objects/{object_id}/tasks/{task_id}/status",
        headers=auth_headers(foreman_token),
        json={"status": "not_applicable"},
    )

    assert update_response.status_code == 200
    assert update_response.json()["status"] == "not_applicable"
    assert update_response.json()["completed_at"] is None
    assert update_response.json()["completed_by_id"] is None


async def test_single_choice_task_marks_only_sibling_choice_not_applicable(
    client: AsyncClient,
    create_test_user,
    create_task_template,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    foreman = await create_test_user(
        email="foreman@example.com",
        role=UserRole.FOREMAN,
    )
    root_template = await create_task_template(
        title="Documentation",
        source_id="root-1",
        children_mode=TaskChildrenMode.SINGLE_CHOICE,
    )
    yes_template = await create_task_template(
        title="Есть РД",
        parent_id=root_template.id,
        source_id="yes-1",
        parent_source_id="root-1",
        depth=1,
        sort_order=0,
    )
    no_template = await create_task_template(
        title="Нет РД",
        parent_id=root_template.id,
        source_id="no-1",
        parent_source_id="root-1",
        depth=1,
        sort_order=1,
    )
    await create_task_template(
        title="Continue with RD",
        parent_id=yes_template.id,
        source_id="yes-child-1",
        parent_source_id="yes-1",
        depth=2,
    )
    await create_task_template(
        title="Work by PPR",
        parent_id=no_template.id,
        source_id="no-child-1",
        parent_source_id="no-1",
        depth=2,
    )
    admin_token = await login(client, email="admin@example.com")

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
    tasks = tasks_response.json()
    root_task = next(task for task in tasks if task["title"] == "Documentation")
    yes_task = next(task for task in tasks if task["title"] == "Есть РД")
    foreman_token = await login(client, email="foreman@example.com")

    update_response = await client.patch(
        f"/api/v1/objects/{object_id}/tasks/{yes_task['id']}/status",
        headers=auth_headers(foreman_token),
        json={"status": "done"},
    )
    list_response = await client.get(
        f"/api/v1/objects/{object_id}/tasks",
        headers=auth_headers(admin_token),
    )
    progress_response = await client.get(
        f"/api/v1/objects/{object_id}/progress",
        headers=auth_headers(admin_token),
    )

    assert update_response.status_code == 200
    assert update_response.json()["main_task_id"] == root_task["id"]
    updated_tasks = list_response.json()
    assert next(task for task in updated_tasks if task["title"] == "Есть РД")[
        "status"
    ] == "done"
    assert next(task for task in updated_tasks if task["title"] == "Continue with RD")[
        "status"
    ] == "todo"
    assert next(task for task in updated_tasks if task["title"] == "Нет РД")[
        "status"
    ] == "not_applicable"
    assert next(task for task in updated_tasks if task["title"] == "Work by PPR")[
        "status"
    ] == "todo"
    assert progress_response.json() == 33
    continue_task = next(
        task
        for task in updated_tasks
        if task["title"] == "Continue with RD"
    )

    child_update_response = await client.patch(
        f"/api/v1/objects/{object_id}/tasks/{continue_task['id']}/status",
        headers=auth_headers(foreman_token),
        json={"status": "done"},
    )

    assert child_update_response.status_code == 200
    assert child_update_response.json()["main_task_id"] == root_task["id"]

    reset_response = await client.patch(
        f"/api/v1/objects/{object_id}/tasks/{yes_task['id']}/status",
        headers=auth_headers(foreman_token),
        json={"status": "todo"},
    )
    reset_list_response = await client.get(
        f"/api/v1/objects/{object_id}/tasks",
        headers=auth_headers(admin_token),
    )

    assert reset_response.status_code == 200
    reset_tasks = reset_list_response.json()
    assert next(task for task in reset_tasks if task["title"] == "Есть РД")[
        "status"
    ] == "todo"
    assert next(task for task in reset_tasks if task["title"] == "Continue with RD")[
        "status"
    ] == "todo"
    assert next(task for task in reset_tasks if task["title"] == "Нет РД")[
        "status"
    ] == "todo"
    assert next(task for task in reset_tasks if task["title"] == "Work by PPR")[
        "status"
    ] == "todo"


async def test_resetting_task_to_todo_resets_all_descendants(
    client: AsyncClient,
    create_test_user,
    create_task_template,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    root_template = await create_task_template(
        title="Root task",
        source_id="root-1",
    )
    child_template = await create_task_template(
        title="Child task",
        parent_id=root_template.id,
        source_id="child-1",
        parent_source_id="root-1",
        depth=1,
    )
    await create_task_template(
        title="Grandchild task",
        parent_id=child_template.id,
        source_id="grandchild-1",
        parent_source_id="child-1",
        depth=2,
    )
    access_token = await login(client, email="admin@example.com")
    create_response = await client.post(
        "/api/v1/objects",
        headers=auth_headers(access_token),
        json=object_payload(),
    )
    object_id = create_response.json()["id"]
    tasks_response = await client.get(
        f"/api/v1/objects/{object_id}/tasks",
        headers=auth_headers(access_token),
    )
    tasks = tasks_response.json()
    root_task = next(task for task in tasks if task["title"] == "Root task")
    child_task = next(task for task in tasks if task["title"] == "Child task")
    grandchild_task = next(task for task in tasks if task["title"] == "Grandchild task")

    for task in (root_task, child_task, grandchild_task):
        response = await client.patch(
            f"/api/v1/objects/{object_id}/tasks/{task['id']}/status",
            headers=auth_headers(access_token),
            json={"status": "done"},
        )
        assert response.status_code == 200

    reset_response = await client.patch(
        f"/api/v1/objects/{object_id}/tasks/{root_task['id']}/status",
        headers=auth_headers(access_token),
        json={"status": "todo"},
    )
    list_response = await client.get(
        f"/api/v1/objects/{object_id}/tasks",
        headers=auth_headers(access_token),
    )

    assert reset_response.status_code == 200
    reset_tasks = list_response.json()
    for title in ("Root task", "Child task", "Grandchild task"):
        task = next(task for task in reset_tasks if task["title"] == title)
        assert task["status"] == "todo"
        assert task["completed_at"] is None
        assert task["completed_by_id"] is None


async def test_foreman_cannot_edit_object_task_title(
    client: AsyncClient,
    create_test_user,
    create_task_template,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    foreman = await create_test_user(
        email="foreman@example.com",
        role=UserRole.FOREMAN,
    )
    await create_task_template(title="Task", source_id="task-1")
    admin_token = await login(client, email="admin@example.com")
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
    foreman_token = await login(client, email="foreman@example.com")

    response = await client.patch(
        f"/api/v1/objects/{object_id}/tasks/{task_id}",
        headers=auth_headers(foreman_token),
        json={"title": "Changed title"},
    )

    assert response.status_code == 403


async def test_object_tasks_tree_keeps_parent_child_structure(
    client: AsyncClient,
    create_test_user,
    create_task_template,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    root_template = await create_task_template(
        title="Root section",
        source_id="root-1",
    )
    await create_task_template(
        title="Child task",
        parent_id=root_template.id,
        source_id="child-1",
        parent_source_id="root-1",
        depth=1,
    )
    access_token = await login(client, email="admin@example.com")
    create_response = await client.post(
        "/api/v1/objects",
        headers=auth_headers(access_token),
        json=object_payload(),
    )
    object_id = create_response.json()["id"]

    response = await client.get(
        f"/api/v1/objects/{object_id}/tasks/tree",
        headers=auth_headers(access_token),
    )

    assert response.status_code == 200
    tree = response.json()
    assert len(tree) == 1
    assert tree[0]["title"] == "Root section"
    assert tree[0]["children"][0]["title"] == "Child task"


async def test_available_tasks_returns_all_main_task_trees_until_todo(
    client: AsyncClient,
    create_test_user,
    create_task_template,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    first_root = await create_task_template(
        title="First header",
        source_id="first-root",
        sort_order=0,
    )
    first_child = await create_task_template(
        title="Done child",
        parent_id=first_root.id,
        source_id="first-child",
        parent_source_id="first-root",
        depth=1,
        sort_order=0,
    )
    await create_task_template(
        title="Next todo",
        parent_id=first_child.id,
        source_id="first-grandchild",
        parent_source_id="first-child",
        depth=2,
        sort_order=0,
    )
    second_root = await create_task_template(
        title="Second header",
        source_id="second-root",
        sort_order=1,
    )
    await create_task_template(
        title="Second todo",
        parent_id=second_root.id,
        source_id="second-child",
        parent_source_id="second-root",
        depth=1,
        sort_order=0,
    )
    await create_task_template(
        title="Hidden header",
        source_id="hidden-root",
        sort_order=2,
    )
    access_token = await login(client, email="admin@example.com")
    create_response = await client.post(
        "/api/v1/objects",
        headers=auth_headers(access_token),
        json=object_payload(),
    )
    object_id = create_response.json()["id"]
    tasks_response = await client.get(
        f"/api/v1/objects/{object_id}/tasks",
        headers=auth_headers(access_token),
    )
    tasks = tasks_response.json()
    done_child = next(task for task in tasks if task["title"] == "Done child")
    hidden_header = next(task for task in tasks if task["title"] == "Hidden header")
    await client.patch(
        f"/api/v1/objects/{object_id}/tasks/{done_child['id']}/status",
        headers=auth_headers(access_token),
        json={"status": "done"},
    )
    await client.patch(
        f"/api/v1/objects/{object_id}/tasks/{hidden_header['id']}/status",
        headers=auth_headers(access_token),
        json={"status": "not_applicable"},
    )

    response = await client.get(
        f"/api/v1/objects/{object_id}/tasks/available",
        headers=auth_headers(access_token),
    )

    assert response.status_code == 200
    available_trees = response.json()
    assert [tree["title"] for tree in available_trees] == [
        "First header",
        "Second header",
    ]
    assert available_trees[0]["children"][0]["title"] == "Done child"
    assert available_trees[0]["children"][0]["children"][0]["title"] == "Next todo"
    assert available_trees[0]["children"][0]["children"][0]["children"] == []
    assert available_trees[1]["children"][0]["title"] == "Second todo"
    assert available_trees[1]["children"][0]["children"] == []


async def test_foreman_cannot_read_unassigned_object_tasks(
    client: AsyncClient,
    create_test_user,
    create_test_object,
) -> None:
    await create_test_user(email="foreman@example.com", role=UserRole.FOREMAN)
    obj = await create_test_object()
    foreman_token = await login(client, email="foreman@example.com")

    response = await client.get(
        f"/api/v1/objects/{obj.id}/tasks",
        headers=auth_headers(foreman_token),
    )

    assert response.status_code == 403


async def test_chief_engineer_can_add_and_delete_object_task(
    client: AsyncClient,
    create_test_user,
    create_test_object,
) -> None:
    await create_test_user(
        email="chief@example.com",
        role=UserRole.CHIEF_ENGINEER,
    )
    obj = await create_test_object()
    chief_token = await login(client, email="chief@example.com")

    create_response = await client.post(
        f"/api/v1/objects/{obj.id}/tasks",
        headers=auth_headers(chief_token),
        json={"title": "Custom task"},
    )
    task_id = create_response.json()["id"]
    delete_response = await client.delete(
        f"/api/v1/objects/{obj.id}/tasks/{task_id}",
        headers=auth_headers(chief_token),
    )
    list_response = await client.get(
        f"/api/v1/objects/{obj.id}/tasks",
        headers=auth_headers(chief_token),
    )

    assert create_response.status_code == 201
    assert create_response.json()["title"] == "Custom task"
    assert delete_response.status_code == 204
    assert list_response.status_code == 200
    assert list_response.json() == []


async def test_post_task_update_alias_can_set_deadline_and_count_overdue(
    client: AsyncClient,
    create_test_user,
    create_task_template,
) -> None:
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    await create_task_template(title="Deadline task", source_id="deadline-task")
    admin_token = await login(client, email="admin@example.com")

    create_response = await client.post(
        "/api/v1/objects",
        headers=auth_headers(admin_token),
        json=object_payload(),
    )
    object_id = create_response.json()["id"]
    tasks_response = await client.get(
        f"/api/v1/objects/{object_id}/tasks",
        headers=auth_headers(admin_token),
    )
    task_id = tasks_response.json()[0]["id"]

    overdue_deadline = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()

    update_response = await client.post(
        f"/api/v1/objects/{object_id}/tasks/{task_id}",
        headers=auth_headers(admin_token),
        json={"title": "Deadline task", "deadline": overdue_deadline},
    )
    overdue_count_response = await client.get(
        f"/api/v1/objects/{object_id}/tasks/overdue_count",
        headers=auth_headers(admin_token),
    )
    overdue_tasks_response = await client.get(
        f"/api/v1/objects/{object_id}/tasks/overdue",
        headers=auth_headers(admin_token),
    )
    cleared_response = await client.post(
        f"/api/v1/objects/{object_id}/tasks/{task_id}",
        headers=auth_headers(admin_token),
        json={"title": "Deadline task", "deadline": None},
    )

    assert update_response.status_code == 200
    assert update_response.json()["deadline"] is not None
    assert overdue_count_response.json() == 1
    assert len(overdue_tasks_response.json()) == 1
    assert cleared_response.status_code == 200
    assert cleared_response.json()["deadline"] is None
