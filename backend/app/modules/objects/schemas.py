from app.modules.objects.models import ConstructionObject, ObjectToUser
from pydantic import BaseModel, Field
from datetime import date, datetime

from app.db.base import Base

class ObjectBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1024)
    address: str = Field(min_length=1, max_length=255)
    is_active: bool = True
    start_date: date
    end_date: date | None = None

class ObjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=1024)
    address: str | None = Field(default=None, min_length=1, max_length=255)
    is_active: bool | None = None
    start_date: date | None = None
    end_date: date | None = None

class ObjectRead(ObjectBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }