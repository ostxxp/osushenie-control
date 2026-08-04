from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, ForeignKey, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.modules.tasks.models import ObjectTaskStatus


class TaskActivityAction(StrEnum):
    CREATED = "created"
    UPDATED = "updated"
    STATUS_CHANGED = "status_changed"
    ASSIGNED = "assigned"
    STARTED = "started"
    SUBMITTED = "submitted"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    BRANCH_SELECTED = "branch_selected"
    BRANCH_CLEARED = "branch_cleared"
    DEACTIVATED = "deactivated"
    ATTACHMENT_ADDED = "attachment_added"
    ATTACHMENT_REMOVED = "attachment_removed"


class TaskActivity(Base):
    __tablename__ = "task_activities"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    object_id: Mapped[int | None] = mapped_column(
        ForeignKey("objects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    task_id: Mapped[int | None] = mapped_column(
        ForeignKey("object_tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    actor_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    object_name: Mapped[str] = mapped_column(String(255), nullable=False)
    task_title: Mapped[str] = mapped_column(String(255), nullable=False)
    action: Mapped[TaskActivityAction] = mapped_column(String(32), nullable=False, index=True)
    from_status: Mapped[ObjectTaskStatus | None] = mapped_column(String(32), nullable=True)
    to_status: Mapped[ObjectTaskStatus | None] = mapped_column(String(32), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
