"""create task sync receipts

Revision ID: b23f60718d94
Revises: a12e5f607c83
Create Date: 2026-08-04 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b23f60718d94"
down_revision: Union[str, None] = "a12e5f607c83"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "task_sync_receipts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("operation_id", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=True),
        sa.Column("outcome", sa.String(length=32), nullable=False),
        sa.Column("resulting_version", sa.Integer(), nullable=True),
        sa.Column("error", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["task_id"], ["object_tasks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "operation_id", name="uq_task_sync_user_operation"),
    )
    op.create_index("ix_task_sync_receipts_id", "task_sync_receipts", ["id"])
    op.create_index("ix_task_sync_receipts_user_id", "task_sync_receipts", ["user_id"])
    op.create_index("ix_task_sync_receipts_task_id", "task_sync_receipts", ["task_id"])


def downgrade() -> None:
    op.drop_index("ix_task_sync_receipts_task_id", table_name="task_sync_receipts")
    op.drop_index("ix_task_sync_receipts_user_id", table_name="task_sync_receipts")
    op.drop_index("ix_task_sync_receipts_id", table_name="task_sync_receipts")
    op.drop_table("task_sync_receipts")
