"""add task children mode

Revision ID: 4b7d2c9e1a6f
Revises: 9a5621fe8f05
Create Date: 2026-05-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4b7d2c9e1a6f"
down_revision: Union[str, None] = "9a5621fe8f05"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "task_templates",
        sa.Column(
            "children_mode",
            sa.String(length=32),
            server_default="all",
            nullable=False,
        ),
    )
    op.add_column(
        "object_tasks",
        sa.Column(
            "children_mode",
            sa.String(length=32),
            server_default="all",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("object_tasks", "children_mode")
    op.drop_column("task_templates", "children_mode")
