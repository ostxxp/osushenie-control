from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.modules.objects.models import ObjectToUser
from app.modules.photos.models import PhotoType
from app.modules.users.models import UserRole
from tests.conftest import auth_headers, login


async def assign_user_to_object(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    object_id: int,
    user_id: int,
) -> None:
    async with session_factory() as session:
        session.add(ObjectToUser(object_id=object_id, user_id=user_id))
        await session.commit()


async def test_user_can_upload_replace_get_and_delete_profile_avatar(
    client: AsyncClient,
    create_test_user,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    access_token = await login(client, email="admin@example.com")

    first_response = await client.post(
        "/api/v1/photos/profile/avatar",
        headers=auth_headers(access_token),
        files={"file": ("avatar.png", b"first-avatar", "image/png")},
    )
    first_photo_id = first_response.json()["id"]
    second_response = await client.post(
        "/api/v1/photos/profile/avatar",
        headers=auth_headers(access_token),
        files={"file": ("avatar.webp", b"second-avatar", "image/webp")},
    )
    current_response = await client.get(
        "/api/v1/photos/profile/avatar",
        headers=auth_headers(access_token),
    )
    old_file_response = await client.get(
        f"/api/v1/photos/{first_photo_id}/file",
        headers=auth_headers(access_token),
    )
    current_file_response = await client.get(
        second_response.json()["file_url"],
        headers=auth_headers(access_token),
    )
    delete_response = await client.delete(
        "/api/v1/photos/profile/avatar",
        headers=auth_headers(access_token),
    )
    deleted_avatar_response = await client.get(
        "/api/v1/photos/profile/avatar",
        headers=auth_headers(access_token),
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 201
    assert second_response.json()["type"] == PhotoType.PROFILE_AVATAR
    assert second_response.json()["user_id"] is not None
    assert current_response.status_code == 200
    assert current_response.json()["id"] == second_response.json()["id"]
    assert old_file_response.status_code == 404
    assert current_file_response.status_code == 200
    assert current_file_response.content == b"second-avatar"
    assert delete_response.status_code == 204
    assert deleted_avatar_response.status_code == 404


async def test_assigned_user_can_upload_list_and_get_object_photo(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    create_test_user,
    create_test_object,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    foreman = await create_test_user(
        email="foreman@example.com",
        role=UserRole.FOREMAN,
    )
    obj = await create_test_object()
    await assign_user_to_object(
        session_factory,
        object_id=obj.id,
        user_id=foreman.id,
    )
    access_token = await login(client, email="foreman@example.com")

    upload_response = await client.post(
        f"/api/v1/photos/objects/{obj.id}",
        headers=auth_headers(access_token),
        files={"file": ("object.jpg", b"object-photo", "image/jpeg")},
    )
    list_response = await client.get(
        f"/api/v1/photos/objects/{obj.id}",
        headers=auth_headers(access_token),
    )
    file_response = await client.get(
        upload_response.json()["file_url"],
        headers=auth_headers(access_token),
    )

    assert upload_response.status_code == 201
    assert upload_response.json()["type"] == PhotoType.OBJECT_PHOTO
    assert upload_response.json()["object_id"] == obj.id
    assert upload_response.json()["uploaded_by_id"] == foreman.id
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
    assert list_response.json()[0]["id"] == upload_response.json()["id"]
    assert file_response.status_code == 200
    assert file_response.content == b"object-photo"


async def test_unassigned_foreman_cannot_access_object_photos(
    client: AsyncClient,
    create_test_user,
    create_test_object,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    await create_test_user(email="foreman@example.com", role=UserRole.FOREMAN)
    obj = await create_test_object()
    access_token = await login(client, email="foreman@example.com")

    upload_response = await client.post(
        f"/api/v1/photos/objects/{obj.id}",
        headers=auth_headers(access_token),
        files={"file": ("object.png", b"object-photo", "image/png")},
    )
    list_response = await client.get(
        f"/api/v1/photos/objects/{obj.id}",
        headers=auth_headers(access_token),
    )

    assert upload_response.status_code == 403
    assert list_response.status_code == 403


async def test_photo_upload_rejects_non_image_file(
    client: AsyncClient,
    create_test_user,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    access_token = await login(client, email="admin@example.com")

    response = await client.post(
        "/api/v1/photos/profile/avatar",
        headers=auth_headers(access_token),
        files={"file": ("notes.txt", b"text", "text/plain")},
    )

    assert response.status_code == 400


async def test_only_uploader_or_admin_can_delete_object_photo(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    create_test_user,
    create_test_object,
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    await create_test_user(email="admin@example.com", role=UserRole.ADMIN)
    uploader = await create_test_user(
        email="uploader@example.com",
        role=UserRole.FOREMAN,
    )
    other_foreman = await create_test_user(
        email="other@example.com",
        role=UserRole.FOREMAN,
    )
    obj = await create_test_object()
    await assign_user_to_object(session_factory, object_id=obj.id, user_id=uploader.id)
    await assign_user_to_object(session_factory, object_id=obj.id, user_id=other_foreman.id)
    uploader_token = await login(client, email="uploader@example.com")
    other_token = await login(client, email="other@example.com")
    admin_token = await login(client, email="admin@example.com")

    upload_response = await client.post(
        f"/api/v1/photos/objects/{obj.id}",
        headers=auth_headers(uploader_token),
        files={"file": ("object.png", b"object-photo", "image/png")},
    )
    photo_id = upload_response.json()["id"]
    forbidden_delete_response = await client.delete(
        f"/api/v1/photos/{photo_id}",
        headers=auth_headers(other_token),
    )
    admin_delete_response = await client.delete(
        f"/api/v1/photos/{photo_id}",
        headers=auth_headers(admin_token),
    )
    file_response = await client.get(
        f"/api/v1/photos/{photo_id}/file",
        headers=auth_headers(admin_token),
    )

    assert upload_response.status_code == 201
    assert forbidden_delete_response.status_code == 403
    assert admin_delete_response.status_code == 204
    assert file_response.status_code == 404
