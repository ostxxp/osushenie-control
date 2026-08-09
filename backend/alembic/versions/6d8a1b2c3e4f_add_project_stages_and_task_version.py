"""add project stages and task version

Revision ID: 6d8a1b2c3e4f
Revises: 5c0d7e8f9a12
Create Date: 2026-08-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6d8a1b2c3e4f"
down_revision: Union[str, None] = "5c0d7e8f9a12"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "task_templates",
        sa.Column("stage", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "object_tasks",
        sa.Column("stage", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "object_tasks",
        sa.Column(
            "version",
            sa.Integer(),
            server_default="1",
            nullable=False,
        ),
    )
    op.create_index("ix_task_templates_stage", "task_templates", ["stage"])
    op.create_index("ix_object_tasks_stage", "object_tasks", ["stage"])

    root_stage_case = """
        CASE
            WHEN lower(title) LIKE '%договор%' THEN 'contract_start'
            WHEN lower(title) LIKE '%рабочая документац%' THEN 'documentation_approvals'
            WHEN lower(title) LIKE '%ответственный итр%'
              OR lower(title) LIKE '%подготов%'
              OR lower(title) LIKE '%мобилизац%' THEN 'preparation_mobilization'
            WHEN lower(title) LIKE '%охрана труд%'
              OR lower(title) LIKE '%промбезопас%' THEN 'safety_industrial'
            WHEN lower(title) LIKE '%эксплуатац%'
              OR lower(title) LIKE '%мониторинг%' THEN 'operation_monitoring'
            WHEN lower(title) LIKE '%сдач%'
              OR lower(title) LIKE '%приемк%'
              OR lower(title) LIKE '%приёмк%' THEN 'handover_acceptance'
            WHEN lower(title) LIKE '%заверш%'
              OR lower(title) LIKE '%демобилизац%'
              OR lower(title) LIKE '%гарант%' THEN 'completion_warranty'
            ELSE 'construction_installation'
        END
    """

    op.execute(
        sa.text(
            f"UPDATE task_templates SET stage = {root_stage_case} "
            "WHERE parent_id IS NULL"
        )
    )
    op.execute(
        sa.text(
            """
            WITH RECURSIVE template_tree AS (
                SELECT id, stage
                FROM task_templates
                WHERE parent_id IS NULL
                UNION ALL
                SELECT child.id, parent.stage
                FROM task_templates AS child
                JOIN template_tree AS parent ON child.parent_id = parent.id
            )
            UPDATE task_templates AS task
            SET stage = tree.stage
            FROM template_tree AS tree
            WHERE task.id = tree.id AND task.stage IS NULL
            """
        )
    )
    op.execute(
        sa.text(
            f"UPDATE object_tasks SET stage = {root_stage_case} "
            "WHERE parent_id IS NULL"
        )
    )
    op.execute(
        sa.text(
            """
            WITH RECURSIVE task_tree AS (
                SELECT id, stage
                FROM object_tasks
                WHERE parent_id IS NULL
                UNION ALL
                SELECT child.id, parent.stage
                FROM object_tasks AS child
                JOIN task_tree AS parent ON child.parent_id = parent.id
            )
            UPDATE object_tasks AS task
            SET stage = tree.stage
            FROM task_tree AS tree
            WHERE task.id = tree.id AND task.stage IS NULL
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_object_tasks_stage", table_name="object_tasks")
    op.drop_index("ix_task_templates_stage", table_name="task_templates")
    op.drop_column("object_tasks", "version")
    op.drop_column("object_tasks", "stage")
    op.drop_column("task_templates", "stage")
