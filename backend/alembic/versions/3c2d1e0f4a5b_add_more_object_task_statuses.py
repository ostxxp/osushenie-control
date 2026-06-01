"""add more object task statuses

Revision ID: 3c2d1e0f4a5b
Revises: 1f4b0c8d9e2a
Create Date: 2026-05-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "3c2d1e0f4a5b"
down_revision: Union[str, None] = "1f4b0c8d9e2a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE object_task_status ADD VALUE IF NOT EXISTS 'SKIPPED'")
        op.execute(
            "ALTER TYPE object_task_status ADD VALUE IF NOT EXISTS 'NOT_APPLICABLE'"
        )


def downgrade() -> None:
    pass
