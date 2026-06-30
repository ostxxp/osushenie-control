from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.objects.models import ObjectToUser
from app.modules.photos.models import Photo, PhotoType
from app.modules.users.models import User


ALLOWED_IMAGE_MIME_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def serialize_photo(photo: Photo) -> dict:
    return {
        "id": photo.id,
        "type": photo.type,
        "user_id": photo.user_id,
        "object_id": photo.object_id,
        "uploaded_by_id": photo.uploaded_by_id,
        "original_filename": photo.original_filename,
        "mime_type": photo.mime_type,
        "size_bytes": photo.size_bytes,
        "is_active": photo.is_active,
        "file_url": f"/api/v1/photos/{photo.id}/file",
        "created_at": photo.created_at,
        "updated_at": photo.updated_at,
    }


async def create_profile_avatar(
    db: AsyncSession,
    *,
    file: UploadFile,
    current_user: User,
    user_id: int | None = None,
) -> Photo:
    avatar_user_id = user_id if user_id is not None else current_user.id
    content, mime_type = await _read_valid_image(file)
    file_path, stored_filename = _save_photo_file(
        content,
        mime_type=mime_type,
        directory="profile_avatars",
    )

    await db.execute(
        update(Photo)
        .where(
            Photo.type == PhotoType.PROFILE_AVATAR,
            Photo.user_id == avatar_user_id,
            Photo.is_active.is_(True),
        )
        .values(is_active=False)
    )

    photo = Photo(
        type=PhotoType.PROFILE_AVATAR,
        user_id=avatar_user_id,
        uploaded_by_id=current_user.id,
        original_filename=file.filename or stored_filename,
        stored_filename=stored_filename,
        file_path=str(file_path),
        mime_type=mime_type,
        size_bytes=len(content),
    )
    db.add(photo)
    await db.commit()
    await db.refresh(photo)
    return photo


async def create_object_photo(
    db: AsyncSession,
    *,
    object_id: int,
    file: UploadFile,
    current_user: User,
) -> Photo:
    content, mime_type = await _read_valid_image(file)
    file_path, stored_filename = _save_photo_file(
        content,
        mime_type=mime_type,
        directory=f"objects/{object_id}",
    )

    photo = Photo(
        type=PhotoType.OBJECT_PHOTO,
        object_id=object_id,
        uploaded_by_id=current_user.id,
        original_filename=file.filename or stored_filename,
        stored_filename=stored_filename,
        file_path=str(file_path),
        mime_type=mime_type,
        size_bytes=len(content),
    )
    db.add(photo)
    await db.commit()
    await db.refresh(photo)
    return photo


async def get_active_profile_avatar(
    db: AsyncSession,
    *,
    user_id: int,
) -> Photo | None:
    result = await db.execute(
        select(Photo)
        .where(
            Photo.type == PhotoType.PROFILE_AVATAR,
            Photo.user_id == user_id,
            Photo.is_active.is_(True),
        )
        .order_by(Photo.created_at.desc(), Photo.id.desc())
    )
    return result.scalars().first()


async def list_object_photos(
    db: AsyncSession,
    *,
    object_id: int,
) -> list[Photo]:
    result = await db.execute(
        select(Photo)
        .where(
            Photo.type == PhotoType.OBJECT_PHOTO,
            Photo.object_id == object_id,
            Photo.is_active.is_(True),
        )
        .order_by(Photo.created_at.desc(), Photo.id.desc())
    )
    return list(result.scalars().all())


async def get_photo_or_404(
    db: AsyncSession,
    *,
    photo_id: int,
) -> Photo:
    result = await db.execute(
        select(Photo).where(
            Photo.id == photo_id,
            Photo.is_active.is_(True),
        )
    )
    photo = result.scalar_one_or_none()

    if photo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Фотография не найдена.",
        )

    return photo


async def ensure_user_can_view_photo(
    db: AsyncSession,
    *,
    photo: Photo,
    current_user: User,
) -> None:
    if photo.type == PhotoType.PROFILE_AVATAR:
        return

    if photo.object_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Фотография не найдена.",
        )

    if current_user.role in ("admin", "chief_engineer"):
        return

    result = await db.execute(
        select(ObjectToUser).where(
            ObjectToUser.object_id == photo.object_id,
            ObjectToUser.user_id == current_user.id,
        )
    )

    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="У вас нет доступа к этой фотографии.",
        )


async def ensure_user_can_delete_photo(
    db: AsyncSession,
    *,
    photo: Photo,
    current_user: User,
) -> None:
    await ensure_user_can_view_photo(db, photo=photo, current_user=current_user)

    if photo.uploaded_by_id == current_user.id:
        return

    if current_user.role in ("admin", "chief_engineer"):
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Вам не разрешено удалять эту фотографию.",
    )


async def deactivate_photo(db: AsyncSession, *, photo: Photo) -> None:
    photo.is_active = False
    await db.commit()


async def _read_valid_image(file: UploadFile) -> tuple[bytes, str]:
    mime_type = file.content_type or ""

    if mime_type not in ALLOWED_IMAGE_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Разрешены только файлы расширений .JPG, .PNG и .WEBP",
        )

    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Загруженный файл пуст.",
        )

    if len(content) > settings.MAX_PHOTO_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Фотография слишком большая. Максимальный размер - 5 МБ.",
        )

    return content, mime_type


def _save_photo_file(
    content: bytes,
    *,
    mime_type: str,
    directory: str,
) -> tuple[Path, str]:
    extension = ALLOWED_IMAGE_MIME_TYPES[mime_type]
    stored_filename = f"{uuid4().hex}{extension}"
    upload_dir = Path(settings.UPLOAD_DIR) / directory
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_path = upload_dir / stored_filename
    file_path.write_bytes(content)

    return file_path, stored_filename
