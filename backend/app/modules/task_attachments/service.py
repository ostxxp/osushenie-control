from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.task_attachments.models import TaskAttachment
from app.modules.tasks.models import ObjectTask
from app.modules.users.models import User, UserRole


ALLOWED_ATTACHMENT_MIME_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "text/plain": ".txt",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
}


def serialize_task_attachment(attachment: TaskAttachment) -> dict:
    return {
        "id": attachment.id,
        "task_id": attachment.task_id,
        "uploaded_by_id": attachment.uploaded_by_id,
        "original_filename": attachment.original_filename,
        "mime_type": attachment.mime_type,
        "size_bytes": attachment.size_bytes,
        "is_active": attachment.is_active,
        "file_url": (
            f"/api/v1/objects/tasks/{attachment.task_id}/attachments/"
            f"{attachment.id}/file"
        ),
        "created_at": attachment.created_at,
    }


async def create_task_attachment(
    db: AsyncSession,
    *,
    task: ObjectTask,
    file: UploadFile,
    current_user: User,
) -> TaskAttachment:
    mime_type = file.content_type or ""
    extension = ALLOWED_ATTACHMENT_MIME_TYPES.get(mime_type)
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported attachment type.",
        )

    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )
    if len(content) > settings.MAX_TASK_ATTACHMENT_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Attachment is too large. Maximum size is 20 MB.",
        )

    stored_filename = f"{uuid4().hex}{extension}"
    upload_dir = Path(settings.UPLOAD_DIR) / "task_attachments" / str(task.id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / stored_filename
    file_path.write_bytes(content)

    attachment = TaskAttachment(
        task_id=task.id,
        uploaded_by_id=current_user.id,
        original_filename=(file.filename or stored_filename)[:255],
        stored_filename=stored_filename,
        file_path=str(file_path),
        mime_type=mime_type,
        size_bytes=len(content),
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    return attachment


async def list_task_attachments(
    db: AsyncSession,
    *,
    task_id: int,
) -> list[TaskAttachment]:
    result = await db.execute(
        select(TaskAttachment)
        .where(
            TaskAttachment.task_id == task_id,
            TaskAttachment.is_active.is_(True),
        )
        .order_by(TaskAttachment.created_at.desc(), TaskAttachment.id.desc())
    )
    return list(result.scalars().all())


async def get_task_attachment_or_404(
    db: AsyncSession,
    *,
    attachment_id: int,
    task_id: int,
) -> TaskAttachment:
    attachment = await db.scalar(
        select(TaskAttachment).where(
            TaskAttachment.id == attachment_id,
            TaskAttachment.task_id == task_id,
            TaskAttachment.is_active.is_(True),
        )
    )
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found.")
    return attachment


async def deactivate_task_attachment(
    db: AsyncSession,
    *,
    attachment: TaskAttachment,
    current_user: User,
) -> None:
    if (
        attachment.uploaded_by_id != current_user.id
        and current_user.role not in {UserRole.ADMIN, UserRole.CHIEF_ENGINEER}
    ):
        raise HTTPException(status_code=403, detail="You cannot delete this attachment.")
    attachment.is_active = False
    await db.commit()

