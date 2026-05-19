"""add auth sessions

Revision ID: 8d8e0d56c8d4
Revises: 57563ccdd922
Create Date: 2026-05-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "8d8e0d56c8d4"
down_revision: Union[str, None] = "57563ccdd922"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("refresh_token_hash", sa.String(length=64), nullable=False),
        sa.Column("refresh_token_jti", sa.String(length=36), nullable=False),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("ip_address", sa.String(length=45), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_auth_sessions_user_id"), "auth_sessions", ["user_id"])
    op.create_index(
        op.f("ix_auth_sessions_refresh_token_jti"),
        "auth_sessions",
        ["refresh_token_jti"],
        unique=True,
    )

    op.create_table(
        "revoked_access_tokens",
        sa.Column("jti", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.String(length=36), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "revoked_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["session_id"], ["auth_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("jti"),
    )
    op.create_index(
        op.f("ix_revoked_access_tokens_user_id"),
        "revoked_access_tokens",
        ["user_id"],
    )
    op.create_index(
        op.f("ix_revoked_access_tokens_session_id"),
        "revoked_access_tokens",
        ["session_id"],
    )
    op.create_index(
        op.f("ix_revoked_access_tokens_expires_at"),
        "revoked_access_tokens",
        ["expires_at"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_revoked_access_tokens_expires_at"),
        table_name="revoked_access_tokens",
    )
    op.drop_index(
        op.f("ix_revoked_access_tokens_session_id"),
        table_name="revoked_access_tokens",
    )
    op.drop_index(
        op.f("ix_revoked_access_tokens_user_id"),
        table_name="revoked_access_tokens",
    )
    op.drop_table("revoked_access_tokens")
    op.drop_index(
        op.f("ix_auth_sessions_refresh_token_jti"),
        table_name="auth_sessions",
    )
    op.drop_index(op.f("ix_auth_sessions_user_id"), table_name="auth_sessions")
    op.drop_table("auth_sessions")
