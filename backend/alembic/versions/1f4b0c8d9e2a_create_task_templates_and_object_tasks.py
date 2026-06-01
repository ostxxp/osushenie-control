"""create task templates and object tasks

Revision ID: 1f4b0c8d9e2a
Revises: f2b7d4e0b9a1
Create Date: 2026-05-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "1f4b0c8d9e2a"
down_revision: Union[str, None] = "f2b7d4e0b9a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


object_task_status = sa.Enum(
    "TODO",
    "IN_PROGRESS",
    "DONE",
    "SKIPPED",
    "NOT_APPLICABLE",
    name="object_task_status",
)


def upgrade() -> None:
    op.create_table(
        "task_templates",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("source_id", sa.String(length=128), nullable=True),
        sa.Column("parent_source_id", sa.String(length=128), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("depth", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["task_templates.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_templates_id", "task_templates", ["id"], unique=False)
    op.create_index(
        "ix_task_templates_parent_id",
        "task_templates",
        ["parent_id"],
        unique=False,
    )
    op.create_index(
        "ix_task_templates_parent_source_id",
        "task_templates",
        ["parent_source_id"],
        unique=False,
    )
    op.create_index(
        "ix_task_templates_source_id",
        "task_templates",
        ["source_id"],
        unique=True,
    )

    op.create_table(
        "object_tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("object_id", sa.Integer(), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("template_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("depth", sa.Integer(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("status", object_task_status, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_by_id", sa.Integer(), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["completed_by_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["object_id"],
            ["objects.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["object_tasks.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["template_id"],
            ["task_templates.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_object_tasks_id", "object_tasks", ["id"], unique=False)
    op.create_index(
        "ix_object_tasks_completed_by_id",
        "object_tasks",
        ["completed_by_id"],
        unique=False,
    )
    op.create_index(
        "ix_object_tasks_object_id",
        "object_tasks",
        ["object_id"],
        unique=False,
    )
    op.create_index(
        "ix_object_tasks_parent_id",
        "object_tasks",
        ["parent_id"],
        unique=False,
    )
    op.create_index(
        "ix_object_tasks_template_id",
        "object_tasks",
        ["template_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_object_tasks_template_id", table_name="object_tasks")
    op.drop_index("ix_object_tasks_parent_id", table_name="object_tasks")
    op.drop_index("ix_object_tasks_object_id", table_name="object_tasks")
    op.drop_index("ix_object_tasks_completed_by_id", table_name="object_tasks")
    op.drop_index("ix_object_tasks_id", table_name="object_tasks")
    op.drop_table("object_tasks")
    object_task_status.drop(op.get_bind(), checkfirst=True)

    op.drop_index("ix_task_templates_source_id", table_name="task_templates")
    op.drop_index("ix_task_templates_parent_source_id", table_name="task_templates")
    op.drop_index("ix_task_templates_parent_id", table_name="task_templates")
    op.drop_index("ix_task_templates_id", table_name="task_templates")
    op.drop_table("task_templates")
