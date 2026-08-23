"""add task assignment and review

Revision ID: 7e9b2c3d4f50
Revises: 6d8a1b2c3e4f
Create Date: 2026-08-04 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7e9b2c3d4f50"
down_revision: Union[str, None] = "6d8a1b2c3e4f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(
            "ALTER TYPE object_task_status ADD VALUE IF NOT EXISTS 'PENDING_REVIEW'"
        )
        op.execute(
            "ALTER TYPE object_task_status ADD VALUE IF NOT EXISTS 'REJECTED'"
        )

    op.add_column("object_tasks", sa.Column("assigned_to_id", sa.Integer()))
    op.add_column("object_tasks", sa.Column("reviewer_id", sa.Integer()))
    op.add_column(
        "object_tasks",
        sa.Column("submitted_at", sa.DateTime(timezone=True)),
    )
    op.add_column(
        "object_tasks",
        sa.Column("reviewed_at", sa.DateTime(timezone=True)),
    )
    op.add_column("object_tasks", sa.Column("reviewed_by_id", sa.Integer()))
    op.add_column(
        "object_tasks",
        sa.Column("rejection_reason", sa.String(length=500)),
    )
    op.create_foreign_key(
        "fk_object_tasks_assigned_to_id_users",
        "object_tasks",
        "users",
        ["assigned_to_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_object_tasks_reviewer_id_users",
        "object_tasks",
        "users",
        ["reviewer_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_object_tasks_reviewed_by_id_users",
        "object_tasks",
        "users",
        ["reviewed_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_object_tasks_assigned_to_id", "object_tasks", ["assigned_to_id"])
    op.create_index("ix_object_tasks_reviewer_id", "object_tasks", ["reviewer_id"])
    op.create_index("ix_object_tasks_reviewed_by_id", "object_tasks", ["reviewed_by_id"])


def downgrade() -> None:
    op.drop_index("ix_object_tasks_reviewed_by_id", table_name="object_tasks")
    op.drop_index("ix_object_tasks_reviewer_id", table_name="object_tasks")
    op.drop_index("ix_object_tasks_assigned_to_id", table_name="object_tasks")
    op.drop_constraint(
        "fk_object_tasks_reviewed_by_id_users",
        "object_tasks",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_object_tasks_reviewer_id_users",
        "object_tasks",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_object_tasks_assigned_to_id_users",
        "object_tasks",
        type_="foreignkey",
    )
    op.drop_column("object_tasks", "rejection_reason")
    op.drop_column("object_tasks", "reviewed_by_id")
    op.drop_column("object_tasks", "reviewed_at")
    op.drop_column("object_tasks", "submitted_at")
    op.drop_column("object_tasks", "reviewer_id")
    op.drop_column("object_tasks", "assigned_to_id")
