from datetime import datetime

from pydantic import BaseModel, Field

from app.modules.tasks.models import ObjectTaskStatus, TaskChildrenMode
from app.modules.tasks.stages import ProjectStage
from app.modules.users.schemas import UserRead


class ObjectTaskCreate(BaseModel):
    parent_id: int | None = None
    title: str = Field(min_length=1, max_length=255)
    sort_order: int | None = Field(default=None, ge=0)
    children_mode: TaskChildrenMode = TaskChildrenMode.ALL
    deadline: datetime | None = None
    stage: ProjectStage | None = None


class ObjectTaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    sort_order: int | None = Field(default=None, ge=0)
    children_mode: TaskChildrenMode | None = None
    status: ObjectTaskStatus | None = None
    is_active: bool | None = None
    deadline: datetime | None = None
    stage: ProjectStage | None = None
    expected_version: int | None = Field(default=None, ge=1)


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
    stage: ProjectStage | None
    status: ObjectTaskStatus
    is_active: bool
    version: int
    deadline: datetime | None
    completed_at: datetime | None
    completed_by_id: int | None
    completed_by: UserRead | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }


class ObjectTaskTreeRead(ObjectTaskRead):
    children: list["ObjectTaskTreeRead"] = Field(default_factory=list)


class ObjectTaskListItemRead(ObjectTaskRead):
    main_task_id: int
    main_task_title: str
    path: list[str]


class ObjectTaskListGroupRead(BaseModel):
    main_task_id: int
    main_task_title: str
    tasks: list[ObjectTaskListItemRead]


class ObjectTaskStatusUpdateRead(ObjectTaskRead):
    main_task_id: int


class ObjectTaskStatsRead(BaseModel):
    total: int
    done: int
    todo: int
    in_progress: int
    overdue: int


class ProjectStageRead(BaseModel):
    code: ProjectStage
    title: str
    order: int
    stats: ObjectTaskStatsRead
