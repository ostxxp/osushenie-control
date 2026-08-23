from datetime import datetime

from pydantic import BaseModel

from app.modules.task_activity.models import TaskActivityAction
from app.modules.tasks.models import ObjectTaskStatus


class TaskActivityRead(BaseModel):
    id: int
    object_id: int | None
    object_name: str
    task_id: int | None
    task_title: str
    actor_user_id: int | None
    actor_full_name: str | None
    action: TaskActivityAction
    from_status: ObjectTaskStatus | None
    to_status: ObjectTaskStatus | None
    details: dict
    created_at: datetime


class TaskActivityPageRead(BaseModel):
    items: list[TaskActivityRead]
    total: int
    limit: int
    offset: int
