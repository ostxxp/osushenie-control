from datetime import date

from httpx import AsyncClient

from app.core.config import settings
from app.modules.users.models import UserRole
from tests.conftest import auth_headers, login


async def test_task_attachment_upload_list_download_and_delete(
    client: AsyncClient,
    create_test_user,
    create_task_template,
    monkeypatch,
    tmp_path,
) -> None:
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    await create_task_template(title="Task with document", source_id="document-task")
    token = await login(client, email="admin@example.com")
    create_response = await client.post(
        "/api/v1/objects",
        headers=auth_headers(token),
        json={
            "name": "Attachment object",
            "address": "Test address",
            "is_active": True,
            "start_date": date(2026, 1, 1).isoformat(),
            "end_date": None,
        },
    )
    object_id = create_response.json()["id"]
    task_id = (
        await client.get(
            f"/api/v1/objects/{object_id}/tasks",
            headers=auth_headers(token),
        )
    ).json()[0]["id"]

    upload_response = await client.post(
        f"/api/v1/objects/{object_id}/tasks/{task_id}/attachments",
        headers=auth_headers(token),
        files={"file": ("inspection.pdf", b"%PDF-test", "application/pdf")},
    )
    attachment = upload_response.json()
    list_response = await client.get(
        f"/api/v1/objects/{object_id}/tasks/{task_id}/attachments",
        headers=auth_headers(token),
    )
    file_response = await client.get(
        attachment["file_url"],
        headers=auth_headers(token),
    )
    delete_response = await client.delete(
        f"/api/v1/objects/{object_id}/tasks/{task_id}/attachments/{attachment['id']}",
        headers=auth_headers(token),
    )
    empty_list_response = await client.get(
        f"/api/v1/objects/{object_id}/tasks/{task_id}/attachments",
        headers=auth_headers(token),
    )

    assert upload_response.status_code == 201
    assert attachment["original_filename"] == "inspection.pdf"
    assert list_response.json()[0]["id"] == attachment["id"]
    assert file_response.status_code == 200
    assert file_response.content == b"%PDF-test"
    assert delete_response.status_code == 204
    assert empty_list_response.json() == []
