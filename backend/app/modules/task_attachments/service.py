import csv
import tempfile
import zipfile
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.modules.task_attachments.models import TaskAttachment
from app.modules.tasks.models import ObjectTask
from app.modules.users.models import User, UserRole
from app.modules.task_activity.models import TaskActivityAction
from app.modules.task_activity.service import record_task_activity


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


def _safe_archive_name(value: str, *, fallback: str) -> str:
    cleaned = "".join(
        "_" if char in '<>:"/\\|?*' or ord(char) < 32 else char
        for char in value.strip()
    ).strip(" .")
    return cleaned[:120] or fallback


def _task_archive_path(
    task: ObjectTask,
    *,
    tasks_by_id: dict[int, ObjectTask],
) -> list[str]:
    path = []
    current: ObjectTask | None = task
    visited: set[int] = set()
    while current is not None and current.id not in visited:
        visited.add(current.id)
        path.append(
            f"{current.sort_order + 1:02d}_{_safe_archive_name(current.title, fallback=f'task-{current.id}')}"
        )
        current = tasks_by_id.get(current.parent_id) if current.parent_id else None
    return list(reversed(path))


async def create_object_documents_archive(
    db: AsyncSession,
    *,
    object_id: int,
) -> Path:
    tasks = list(
        (
            await db.execute(
                select(ObjectTask)
                .where(ObjectTask.object_id == object_id)
                .order_by(ObjectTask.depth, ObjectTask.sort_order, ObjectTask.id)
            )
        ).scalars().all()
    )
    tasks_by_id = {task.id: task for task in tasks}
    attachments = list(
        (
            await db.execute(
                select(TaskAttachment)
                .join(ObjectTask, ObjectTask.id == TaskAttachment.task_id)
                .where(
                    ObjectTask.object_id == object_id,
                    TaskAttachment.is_active.is_(True),
                )
                .order_by(TaskAttachment.task_id, TaskAttachment.created_at, TaskAttachment.id)
            )
        ).scalars().all()
    )

    uploader_ids = {
        attachment.uploaded_by_id
        for attachment in attachments
        if attachment.uploaded_by_id is not None
    }
    uploaders = {}
    if uploader_ids:
        uploaders = {
            user.id: user.full_name
            for user in (
                await db.execute(select(User).where(User.id.in_(uploader_ids)))
            ).scalars().all()
        }

    archive_file = tempfile.NamedTemporaryFile(
        prefix=f"object-{object_id}-documents-",
        suffix=".zip",
        delete=False,
    )
    archive_path = Path(archive_file.name)
    archive_file.close()

    manifest_path = archive_path.with_suffix(".csv")
    try:
        with manifest_path.open("w", encoding="utf-8-sig", newline="") as manifest:
            writer = csv.writer(manifest, delimiter=";")
            writer.writerow(
                [
                    "ID файла",
                    "ID задачи",
                    "Путь задачи",
                    "Имя файла",
                    "Загрузил",
                    "Дата загрузки",
                    "Размер, байт",
                ]
            )
            with zipfile.ZipFile(
                archive_path,
                mode="w",
                compression=zipfile.ZIP_DEFLATED,
            ) as archive:
                for attachment in attachments:
                    task = tasks_by_id.get(attachment.task_id)
                    if task is None:
                        continue
                    task_path = _task_archive_path(task, tasks_by_id=tasks_by_id)
                    filename = _safe_archive_name(
                        attachment.original_filename,
                        fallback=f"attachment-{attachment.id}",
                    )
                    archive_name = "/".join(
                        [*task_path, f"{attachment.id}_{filename}"]
                    )
                    source_path = Path(attachment.file_path)
                    if source_path.is_file():
                        archive.write(source_path, arcname=archive_name)
                    writer.writerow(
                        [
                            attachment.id,
                            task.id,
                            " / ".join(node.split("_", 1)[-1] for node in task_path),
                            attachment.original_filename,
                            uploaders.get(attachment.uploaded_by_id, ""),
                            attachment.created_at.isoformat(),
                            attachment.size_bytes,
                        ]
                    )
                manifest.flush()
                archive.write(manifest_path, arcname="Реестр документов.csv")
    except Exception:
        archive_path.unlink(missing_ok=True)
        raise
    finally:
        manifest_path.unlink(missing_ok=True)

    return archive_path


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
    await record_task_activity(
        db,
        task=task,
        actor_user_id=current_user.id,
        action=TaskActivityAction.ATTACHMENT_ADDED,
        from_status=task.status,
        to_status=task.status,
        details={
            "filename": attachment.original_filename,
            "mime_type": attachment.mime_type,
            "size_bytes": attachment.size_bytes,
        },
    )
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
    task = await db.get(ObjectTask, attachment.task_id)
    if task is not None:
        await record_task_activity(
            db,
            task=task,
            actor_user_id=current_user.id,
            action=TaskActivityAction.ATTACHMENT_REMOVED,
            from_status=task.status,
            to_status=task.status,
            details={"filename": attachment.original_filename},
        )
    await db.commit()
