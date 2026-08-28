from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
class ObjectTaskStatus(StrEnum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    PENDING_REVIEW = "pending_review"
    REJECTED = "rejected"
    DONE = "done"
    SKIPPED = "skipped"
    NOT_APPLICABLE = "not_applicable"


class TaskChildrenMode(StrEnum):
    ALL = "all"
    SINGLE_CHOICE = "single_choice"


class TaskTemplate(Base):
    __tablename__ = "task_templates"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("task_templates.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    source_id: Mapped[str | None] = mapped_column(
        String(128),
        nullable=True,
        unique=True,
        index=True,
    )

    parent_source_id: Mapped[str | None] = mapped_column(
        String(128),
        nullable=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    depth: Mapped[int] = mapped_column(Integer, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    children_mode: Mapped[TaskChildrenMode] = mapped_column(
        String(32),
        default=TaskChildrenMode.ALL,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    parent: Mapped["TaskTemplate | None"] = relationship(
        remote_side=[id],
        back_populates="children",
    )
    children: Mapped[list["TaskTemplate"]] = relationship(
        back_populates="parent",
        cascade="all, delete-orphan",
    )


class ObjectTask(Base):
    __tablename__ = "object_tasks"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    object_id: Mapped[int] = mapped_column(
        ForeignKey("objects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("object_tasks.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("task_templates.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    selected_child_id: Mapped[int | None] = mapped_column(
        ForeignKey("object_tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    depth: Mapped[int] = mapped_column(Integer, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    children_mode: Mapped[TaskChildrenMode] = mapped_column(
        String(32),
        default=TaskChildrenMode.ALL,
        nullable=False,
    )
    status: Mapped[ObjectTaskStatus] = mapped_column(
        Enum(ObjectTaskStatus, name="object_task_status"),
        default=ObjectTaskStatus.TODO,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)

    deadline: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    assigned_to_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    reviewer_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    submitted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    reviewed_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    rejection_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    not_applicable_reason: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    parent: Mapped["ObjectTask | None"] = relationship(
        foreign_keys=[parent_id],
        remote_side=[id],
        back_populates="children",
    )
    children: Mapped[list["ObjectTask"]] = relationship(
        foreign_keys=[parent_id],
        back_populates="parent",
        cascade="all, delete-orphan",
    )
    assigned_to: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[assigned_to_id],
        lazy="selectin",
    )
    reviewer: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[reviewer_id],
        lazy="selectin",
    )
    reviewed_by: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[reviewed_by_id],
        lazy="selectin",
    )
    selected_child: Mapped["ObjectTask | None"] = relationship(
        "ObjectTask",
        foreign_keys=[selected_child_id],
        remote_side=[id],
        post_update=True,
    )
