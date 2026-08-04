from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session
from app.modules.objects.dependencies import user_can_access_object
from app.modules.task_attachments.schemas import TaskAttachmentRead
from app.modules.task_attachments.service import (
    create_task_attachment,
    deactivate_task_attachment,
    get_task_attachment_or_404,
    list_task_attachments,
    serialize_task_attachment,
)
from app.modules.tasks.dependencies import get_object_task_or_404
from app.modules.tasks.models import ObjectTask
from app.modules.users.dependencies import get_current_auth_user
from app.modules.users.models import User


router = APIRouter()


@router.post(
    "/{object_id}/tasks/{task_id}/attachments",
    response_model=TaskAttachmentRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(user_can_access_object)],
)
async def upload_task_attachment(
    file: UploadFile = File(...),
    task: ObjectTask = Depends(get_object_task_or_404),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_auth_user),
) -> dict:
    attachment = await create_task_attachment(
        db,
        task=task,
        file=file,
        current_user=current_user,
    )
    data = serialize_task_attachment(attachment)
    data["file_url"] = (
        f"/api/v1/objects/{task.object_id}/tasks/{task.id}/attachments/"
        f"{attachment.id}/file"
    )
    return data


@router.get(
    "/{object_id}/tasks/{task_id}/attachments",
    response_model=list[TaskAttachmentRead],
    dependencies=[Depends(user_can_access_object)],
)
async def get_task_attachments(
    task: ObjectTask = Depends(get_object_task_or_404),
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    attachments = await list_task_attachments(db, task_id=task.id)
    result = []
    for attachment in attachments:
        data = serialize_task_attachment(attachment)
        data["file_url"] = (
            f"/api/v1/objects/{task.object_id}/tasks/{task.id}/attachments/"
            f"{attachment.id}/file"
        )
        result.append(data)
    return result


@router.get(
    "/{object_id}/tasks/{task_id}/attachments/{attachment_id}/file",
    dependencies=[Depends(user_can_access_object)],
)
async def get_task_attachment_file(
    attachment_id: int,
    task: ObjectTask = Depends(get_object_task_or_404),
    db: AsyncSession = Depends(get_db_session),
) -> FileResponse:
    attachment = await get_task_attachment_or_404(
        db,
        attachment_id=attachment_id,
        task_id=task.id,
    )
    file_path = Path(attachment.file_path)
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Attachment file not found.")
    return FileResponse(
        path=file_path,
        media_type=attachment.mime_type,
        filename=attachment.original_filename,
    )


@router.delete(
    "/{object_id}/tasks/{task_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(user_can_access_object)],
)
async def delete_task_attachment(
    attachment_id: int,
    task: ObjectTask = Depends(get_object_task_or_404),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_auth_user),
) -> None:
    attachment = await get_task_attachment_or_404(
        db,
        attachment_id=attachment_id,
        task_id=task.id,
    )
    await deactivate_task_attachment(
        db,
        attachment=attachment,
        current_user=current_user,
    )

