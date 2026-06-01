"""add phone number to users

Revision ID: f2b7d4e0b9a1
Revises: 8d8e0d56c8d4
Create Date: 2026-05-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f2b7d4e0b9a1"
down_revision: Union[str, None] = "8d8e0d56c8d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("phone_number", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "phone_number")
