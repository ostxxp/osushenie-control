"""create task activity log

Revision ID: a12e5f607c83
Revises: 901d4e5f6b72
Create Date: 2026-08-04 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a12e5f607c83"
down_revision: Union[str, None] = "901d4e5f6b72"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "task_activities",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("object_id", sa.Integer(), nullable=True),
        sa.Column("task_id", sa.Integer(), nullable=True),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("object_name", sa.String(length=255), nullable=False),
        sa.Column("task_title", sa.String(length=255), nullable=False),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("from_status", sa.String(length=32), nullable=True),
        sa.Column("to_status", sa.String(length=32), nullable=True),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["object_id"], ["objects.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["task_id"], ["object_tasks.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_activities_id", "task_activities", ["id"])
    op.create_index("ix_task_activities_object_id", "task_activities", ["object_id"])
    op.create_index("ix_task_activities_task_id", "task_activities", ["task_id"])
    op.create_index("ix_task_activities_actor_user_id", "task_activities", ["actor_user_id"])
    op.create_index("ix_task_activities_action", "task_activities", ["action"])
    op.create_index("ix_task_activities_created_at", "task_activities", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_task_activities_created_at", table_name="task_activities")
    op.drop_index("ix_task_activities_action", table_name="task_activities")
    op.drop_index("ix_task_activities_actor_user_id", table_name="task_activities")
    op.drop_index("ix_task_activities_task_id", table_name="task_activities")
    op.drop_index("ix_task_activities_object_id", table_name="task_activities")
    op.drop_index("ix_task_activities_id", table_name="task_activities")
    op.drop_table("task_activities")
