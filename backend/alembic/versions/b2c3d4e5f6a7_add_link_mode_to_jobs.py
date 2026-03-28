"""add_link_mode_and_account_user_id

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-28 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Link handling on clone jobs
    op.add_column("clone_jobs", sa.Column("link_mode", sa.String(20), server_default="keep", nullable=False))
    op.add_column("clone_jobs", sa.Column("link_replace_url", sa.String(512), nullable=True))

    # User ownership on telegram accounts
    op.add_column("telegram_accounts", sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True))
    op.create_index("ix_telegram_accounts_user_id", "telegram_accounts", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_telegram_accounts_user_id", "telegram_accounts")
    op.drop_column("telegram_accounts", "user_id")
    op.drop_column("clone_jobs", "link_replace_url")
    op.drop_column("clone_jobs", "link_mode")
