from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PhotoType(StrEnum):
    PROFILE_AVATAR = "profile_avatar"
    OBJECT_PHOTO = "object_photo"


class Photo(Base):
    __tablename__ = "photos"
    __table_args__ = (
        CheckConstraint(
            (
                "(type = 'profile_avatar' AND user_id IS NOT NULL AND object_id IS NULL) "
                "OR (type = 'object_photo' AND object_id IS NOT NULL)"
            ),
            name="ck_photos_owner_by_type",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    type: Mapped[PhotoType] = mapped_column(String(32), nullable=False, index=True)

    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    object_id: Mapped[int | None] = mapped_column(
        ForeignKey("objects.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    uploaded_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)

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

    user: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[user_id],
        back_populates="photos",
    )
    object: Mapped["ConstructionObject | None"] = relationship(
        "ConstructionObject",
        foreign_keys=[object_id],
        back_populates="photos",
    )
    uploaded_by: Mapped["User | None"] = relationship(
        "User",
        foreign_keys=[uploaded_by_id],
        back_populates="uploaded_photos",
    )
