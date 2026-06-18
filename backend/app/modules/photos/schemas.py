from datetime import datetime

from pydantic import BaseModel

from app.modules.photos.models import PhotoType


class PhotoRead(BaseModel):
    id: int
    type: PhotoType
    user_id: int | None
    object_id: int | None
    uploaded_by_id: int | None
    original_filename: str
    mime_type: str
    size_bytes: int
    is_active: bool
    file_url: str
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }
