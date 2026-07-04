from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.objects.dependencies import get_object_or_404, user_can_access_object
from app.modules.objects.models import ConstructionObject
from app.modules.photos.schemas import PhotoRead
from app.modules.photos.service import (
    create_object_photo,
    create_profile_avatar,
    deactivate_photo,
    ensure_user_can_delete_photo,
    ensure_user_can_view_photo,
    get_active_profile_avatar,
    get_photo_or_404,
    list_object_photos,
    serialize_photo,
)
from app.modules.users.dependencies import get_current_auth_user, get_user_or_404, require_admin
from app.modules.users.models import User


router = APIRouter()


@router.post(
    "/profile/avatar",
    response_model=PhotoRead,
    status_code=status.HTTP_201_CREATED,
    summary="Upload current user's profile avatar",
)
async def upload_profile_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_auth_user),
) -> dict:
    photo = await create_profile_avatar(
        db,
        file=file,
        current_user=current_user,
    )
    return serialize_photo(photo)


@router.get(
    "/profile/avatar",
    response_model=PhotoRead,
    summary="Get current user's profile avatar",
)
async def get_current_profile_avatar(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_auth_user),
) -> dict:
    photo = await get_active_profile_avatar(db, user_id=current_user.id)

    if photo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile avatar not found.",
        )

    return serialize_photo(photo)


@router.get(
    "/users/{user_id}/avatar",
    response_model=PhotoRead,
    summary="Get user's profile avatar",
)
async def get_user_profile_avatar(
    user: User = Depends(get_user_or_404),
    db: AsyncSession = Depends(get_db_session),
    _: User = Depends(get_current_auth_user),
) -> dict:
    photo = await get_active_profile_avatar(db, user_id=user.id)

    if photo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile avatar not found.",
        )

    return serialize_photo(photo)


@router.post(
    "/users/{user_id}/avatar",
    response_model=PhotoRead,
    status_code=status.HTTP_201_CREATED,
    summary="Upload user's profile avatar",
    dependencies=[Depends(require_admin)],
)
async def upload_user_profile_avatar(
    file: UploadFile = File(...),
    user: User = Depends(get_user_or_404),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_auth_user),
) -> dict:
    photo = await create_profile_avatar(
        db,
        file=file,
        current_user=current_user,
        user_id=user.id,
    )
    return serialize_photo(photo)


@router.delete(
    "/profile/avatar",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete current user's profile avatar",
)
async def delete_current_profile_avatar(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_auth_user),
) -> None:
    photo = await get_active_profile_avatar(db, user_id=current_user.id)

    if photo is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile avatar not found.",
        )

    await deactivate_photo(db, photo=photo)


@router.post(
    "/objects/{object_id}",
    response_model=PhotoRead,
    status_code=status.HTTP_201_CREATED,
    summary="Upload object photo",
    dependencies=[Depends(user_can_access_object)],
)
async def upload_object_photo(
    file: UploadFile = File(...),
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_auth_user),
) -> dict:
    photo = await create_object_photo(
        db,
        object_id=object.id,
        file=file,
        current_user=current_user,
    )
    return serialize_photo(photo)


@router.get(
    "/objects/{object_id}",
    response_model=list[PhotoRead],
    summary="Get object photos",
    dependencies=[Depends(user_can_access_object)],
)
async def get_object_photos(
    object: ConstructionObject = Depends(get_object_or_404),
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    photos = await list_object_photos(db, object_id=object.id)
    return [serialize_photo(photo) for photo in photos]


@router.get(
    "/{photo_id}",
    response_model=PhotoRead,
    summary="Get photo metadata",
)
async def get_photo(
    photo_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_auth_user),
) -> dict:
    photo = await get_photo_or_404(db, photo_id=photo_id)
    await ensure_user_can_view_photo(db, photo=photo, current_user=current_user)
    return serialize_photo(photo)


@router.get(
    "/{photo_id}/file",
    summary="Get photo file",
)
async def get_photo_file(
    photo_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_auth_user),
) -> FileResponse:
    photo = await get_photo_or_404(db, photo_id=photo_id)
    await ensure_user_can_view_photo(db, photo=photo, current_user=current_user)

    file_path = Path(photo.file_path)
    if not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Photo file not found.",
        )

    return FileResponse(
        path=file_path,
        media_type=photo.mime_type,
        filename=photo.original_filename,
    )


@router.delete(
    "/{photo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete photo",
)
async def delete_photo(
    photo_id: int,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_auth_user),
) -> None:
    photo = await get_photo_or_404(db, photo_id=photo_id)
    await ensure_user_can_delete_photo(db, photo=photo, current_user=current_user)
    await deactivate_photo(db, photo=photo)
