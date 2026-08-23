"""add task deadline alerts

Revision ID: d34a7b8c9e01
Revises: b23f60718d94
Create Date: 2026-08-20 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d34a7b8c9e01"
down_revision: Union[str, None] = "b23f60718d94"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "notifications",
        "user_id",
        existing_type=sa.Integer(),
        nullable=True,
    )
    op.drop_constraint(
        "notifications_user_id_fkey",
        "notifications",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "notifications_user_id_fkey",
        "notifications",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_table(
        "task_deadline_alerts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("alert_type", sa.String(length=50), nullable=False),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=False),
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "task_id",
            "alert_type",
            "deadline",
            name="uq_task_deadline_alert_task_type_deadline",
        ),
    )
    op.create_index(
        "ix_task_deadline_alerts_id",
        "task_deadline_alerts",
        ["id"],
    )
    op.create_index(
        "ix_task_deadline_alerts_task_id",
        "task_deadline_alerts",
        ["task_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_task_deadline_alerts_task_id",
        table_name="task_deadline_alerts",
    )
    op.drop_index("ix_task_deadline_alerts_id", table_name="task_deadline_alerts")
    op.drop_table("task_deadline_alerts")
    op.drop_constraint(
        "notifications_user_id_fkey",
        "notifications",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "notifications_user_id_fkey",
        "notifications",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.execute("DELETE FROM notifications WHERE user_id IS NULL")
    op.alter_column(
        "notifications",
        "user_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
