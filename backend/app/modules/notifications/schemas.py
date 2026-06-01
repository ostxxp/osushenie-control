from app.modules.notifications.models import Notifications
from pydantic import BaseModel, Field
from datetime import date, datetime

from app.db.base import Base

class NotificationBase(BaseModel):
    user_id: int
    object_id: int
    message: str = Field(min_length=1, max_length=255)
    is_read: bool = False

class NotificationRead(NotificationBase):
    id: int
    created_at: datetime

    model_config = {
        "from_attributes": True,
    }