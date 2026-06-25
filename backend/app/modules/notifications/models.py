from datetime import date, datetime
from enum import StrEnum

from app.db.base import Base
from sqlalchemy import Boolean, Date, DateTime, String, func, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

class NotificationType(StrEnum):
    USER_ASSIGNED_TO_OBJECT = "user_assigned_to_object"
    OBJECT_CREATED = "object_created"
    TASK_STATUS_CHANGED = "task_status_changed"
    USER_CREATED = "user_created"

class Notifications(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    object_id: Mapped[int] = mapped_column(
        ForeignKey("objects.id", ondelete="CASCADE"),
        nullable=False,
    )

    type: Mapped[NotificationType] = mapped_column(String(50), nullable=False, default=NotificationType.TASK_STATUS_CHANGED, server_default="task_status_changed")

    message: Mapped[str] = mapped_column(String(255), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    notification_reads: Mapped[list["NotificationReads"]] = relationship(
        "NotificationReads",
        back_populates="notification",
        cascade="all, delete-orphan",
    )

class NotificationReads(Base):
    __tablename__ = "notification_reads"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    notification_id: Mapped[int] = mapped_column(
        ForeignKey("notifications.id", ondelete="CASCADE"),
        nullable=False,
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("notification_id", "user_id", name="uq_notification_reads_notification_id"),
    )

    notification: Mapped[Notifications] = relationship("Notifications", back_populates="notification_reads")

    user: Mapped["User"] = relationship("User", back_populates="notification_reads")
