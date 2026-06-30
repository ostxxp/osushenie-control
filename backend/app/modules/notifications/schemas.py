from app.modules.notifications.models import NotificationType
from pydantic import BaseModel, Field
from datetime import date, datetime

from app.db.base import Base

class NotificationBase(BaseModel):
    user_id: int
    actor_user_id: int
    actor_full_name: str | None = None
    object_id: int
    message: str = Field(min_length=1, max_length=255)
    type: NotificationType

class NotificationRead(NotificationBase):
    id: int
    receipt_id: int
    is_read: bool
    read_at: datetime | None = None
    created_at: datetime

    model_config = {
        "from_attributes": True,
    }
