"""create task attachments

Revision ID: 901d4e5f6b72
Revises: 8f0c3d4e5a61
Create Date: 2026-08-04 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "901d4e5f6b72"
down_revision: Union[str, None] = "8f0c3d4e5a61"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "task_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("uploaded_by_id", sa.Integer(), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("stored_filename", sa.String(length=255), nullable=False),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["task_id"],
            ["object_tasks.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stored_filename"),
    )
    op.create_index("ix_task_attachments_id", "task_attachments", ["id"])
    op.create_index(
        "ix_task_attachments_task_id",
        "task_attachments",
        ["task_id"],
    )
    op.create_index(
        "ix_task_attachments_uploaded_by_id",
        "task_attachments",
        ["uploaded_by_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_task_attachments_uploaded_by_id", table_name="task_attachments")
    op.drop_index("ix_task_attachments_task_id", table_name="task_attachments")
    op.drop_index("ix_task_attachments_id", table_name="task_attachments")
    op.drop_table("task_attachments")
