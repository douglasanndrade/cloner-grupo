"""add_user_credits

Revision ID: a1b2c3d4e5f6
Revises: e6160746c42c
Create Date: 2026-03-10 12:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "e6160746c42c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("credits_basic", sa.Integer(), server_default="0", nullable=False))
    op.add_column("users", sa.Column("credits_standard", sa.Integer(), server_default="0", nullable=False))
    op.add_column("users", sa.Column("credits_premium", sa.Integer(), server_default="0", nullable=False))


def downgrade() -> None:
    op.drop_column("users", "credits_premium")
    op.drop_column("users", "credits_standard")
    op.drop_column("users", "credits_basic")
