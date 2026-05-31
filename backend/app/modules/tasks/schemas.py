from datetime import datetime

from pydantic import BaseModel, Field

from app.modules.tasks.models import ObjectTaskStatus, TaskChildrenMode


class ObjectTaskCreate(BaseModel):
    parent_id: int | None = None
    title: str = Field(min_length=1, max_length=255)
    sort_order: int | None = Field(default=None, ge=0)
    children_mode: TaskChildrenMode = TaskChildrenMode.ALL
    deadline: datetime | None = None


class ObjectTaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    sort_order: int | None = Field(default=None, ge=0)
    children_mode: TaskChildrenMode | None = None
    status: ObjectTaskStatus | None = None
    is_active: bool | None = None
    deadline: datetime | None = None


class ObjectTaskStatusUpdate(BaseModel):
    status: ObjectTaskStatus


class ObjectTaskRead(BaseModel):
    id: int
    object_id: int
    parent_id: int | None
    template_id: int | None
    title: str
    depth: int
    sort_order: int
    children_mode: TaskChildrenMode
    status: ObjectTaskStatus
    is_active: bool
    deadline: datetime | None
    completed_at: datetime | None
    completed_by_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }


class ObjectTaskTreeRead(ObjectTaskRead):
    children: list["ObjectTaskTreeRead"] = Field(default_factory=list)


class ObjectTaskStatusUpdateRead(ObjectTaskRead):
    main_task_id: int
