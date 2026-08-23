"""add explicit task branch selection

Revision ID: 8f0c3d4e5a61
Revises: 7e9b2c3d4f50
Create Date: 2026-08-04 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "8f0c3d4e5a61"
down_revision: Union[str, None] = "7e9b2c3d4f50"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("object_tasks", sa.Column("selected_child_id", sa.Integer()))
    op.add_column(
        "object_tasks",
        sa.Column("not_applicable_reason", sa.String(length=500)),
    )
    op.create_foreign_key(
        "fk_object_tasks_selected_child_id",
        "object_tasks",
        "object_tasks",
        ["selected_child_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_object_tasks_selected_child_id",
        "object_tasks",
        ["selected_child_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_object_tasks_selected_child_id", table_name="object_tasks")
    op.drop_constraint(
        "fk_object_tasks_selected_child_id",
        "object_tasks",
        type_="foreignkey",
    )
    op.drop_column("object_tasks", "not_applicable_reason")
    op.drop_column("object_tasks", "selected_child_id")
