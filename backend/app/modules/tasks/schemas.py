from datetime import datetime
from enum import StrEnum

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


class ObjectTaskAssignmentUpdate(BaseModel):
    assigned_to_id: int | None = None
    reviewer_id: int | None = None


class ObjectTaskReject(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class ObjectTaskBranchSelect(BaseModel):
    child_id: int
    expected_version: int | None = Field(default=None, ge=1)


class ObjectTaskRead(BaseModel):
    id: int
    object_id: int
    parent_id: int | None
    template_id: int | None
    selected_child_id: int | None
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
    assigned_to_id: int | None
    assigned_to: UserRead | None = None
    reviewer_id: int | None
    reviewer: UserRead | None = None
    submitted_at: datetime | None
    reviewed_at: datetime | None
    reviewed_by_id: int | None
    reviewed_by: UserRead | None = None
    rejection_reason: str | None
    not_applicable_reason: str | None
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


class TaskAttentionFlag(StrEnum):
    NORMAL = "normal"
    DUE_SOON = "due_soon"
    OVERDUE = "overdue"
    REJECTED = "rejected"


class CurrentStepRead(BaseModel):
    task: ObjectTaskRead | None
    stage: ProjectStage | None
    stage_title: str | None
    stage_order: int | None
    action_required_by: UserRead | None
    flag: TaskAttentionFlag
    days_remaining: int | None


class MyTaskRead(ObjectTaskRead):
    main_task_id: int
    object_name: str
    object_address: str
    action_required: str
    flag: TaskAttentionFlag
    days_remaining: int | None


class MyTaskPageRead(BaseModel):
    items: list[MyTaskRead]
    total: int
    limit: int
    offset: int
