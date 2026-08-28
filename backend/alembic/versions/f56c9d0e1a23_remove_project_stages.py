"""remove project stages

Revision ID: f56c9d0e1a23
Revises: e45b8c9d0f12
Create Date: 2026-08-28 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f56c9d0e1a23"
down_revision: Union[str, None] = "e45b8c9d0f12"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("ix_object_tasks_stage", table_name="object_tasks")
    op.drop_index("ix_task_templates_stage", table_name="task_templates")
    op.drop_column("object_tasks", "stage")
    op.drop_column("task_templates", "stage")


def downgrade() -> None:
    op.add_column(
        "task_templates",
        sa.Column("stage", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "object_tasks",
        sa.Column("stage", sa.String(length=64), nullable=True),
    )
    op.create_index("ix_task_templates_stage", "task_templates", ["stage"])
    op.create_index("ix_object_tasks_stage", "object_tasks", ["stage"])
