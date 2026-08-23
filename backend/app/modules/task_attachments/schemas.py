from datetime import datetime

from pydantic import BaseModel


class TaskAttachmentRead(BaseModel):
    id: int
    task_id: int
    uploaded_by_id: int | None
    original_filename: str
    mime_type: str
    size_bytes: int
    is_active: bool
    file_url: str
    created_at: datetime

