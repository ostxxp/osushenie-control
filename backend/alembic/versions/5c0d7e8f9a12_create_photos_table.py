"""create photos table

Revision ID: 5c0d7e8f9a12
Revises: 82ded332ba73
Create Date: 2026-06-18 19:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "5c0d7e8f9a12"
down_revision: Union[str, None] = "82ded332ba73"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "photos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("object_id", sa.Integer(), nullable=True),
        sa.Column("uploaded_by_id", sa.Integer(), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("stored_filename", sa.String(length=255), nullable=False),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            (
                "(type = 'profile_avatar' AND user_id IS NOT NULL AND object_id IS NULL) "
                "OR (type = 'object_photo' AND object_id IS NOT NULL)"
            ),
            name="ck_photos_owner_by_type",
        ),
        sa.ForeignKeyConstraint(["object_id"], ["objects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stored_filename"),
    )
    op.create_index("ix_photos_id", "photos", ["id"], unique=False)
    op.create_index("ix_photos_object_id", "photos", ["object_id"], unique=False)
    op.create_index("ix_photos_type", "photos", ["type"], unique=False)
    op.create_index("ix_photos_uploaded_by_id", "photos", ["uploaded_by_id"], unique=False)
    op.create_index("ix_photos_user_id", "photos", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_photos_user_id", table_name="photos")
    op.drop_index("ix_photos_uploaded_by_id", table_name="photos")
    op.drop_index("ix_photos_type", table_name="photos")
    op.drop_index("ix_photos_object_id", table_name="photos")
    op.drop_index("ix_photos_id", table_name="photos")
    op.drop_table("photos")
