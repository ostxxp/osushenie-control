"""use text for notification messages

Revision ID: e45b8c9d0f12
Revises: d34a7b8c9e01
Create Date: 2026-08-22 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e45b8c9d0f12"
down_revision: Union[str, None] = "d34a7b8c9e01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "notifications",
        "message",
        existing_type=sa.String(length=255),
        type_=sa.Text(),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "notifications",
        "message",
        existing_type=sa.Text(),
        type_=sa.String(length=255),
        existing_nullable=False,
        postgresql_using="left(message, 255)",
    )
