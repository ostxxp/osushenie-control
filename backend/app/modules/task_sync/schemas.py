from pydantic import BaseModel, Field

from app.modules.tasks.models import ObjectTaskStatus


class TaskSyncOperation(BaseModel):
    operation_id: str = Field(min_length=1, max_length=64)
    task_id: int = Field(gt=0)
    status: ObjectTaskStatus
    expected_version: int = Field(ge=1)


class TaskSyncRequest(BaseModel):
    operations: list[TaskSyncOperation] = Field(min_length=1, max_length=100)


class TaskSyncResult(BaseModel):
    operation_id: str
    task_id: int | None
    outcome: str
    resulting_version: int | None
    error: str | None


class TaskSyncResponse(BaseModel):
    results: list[TaskSyncResult]
