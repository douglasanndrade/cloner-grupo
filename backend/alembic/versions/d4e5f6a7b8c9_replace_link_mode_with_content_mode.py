"""replace link_mode with content_mode

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-03-29 13:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "clone_jobs",
        sa.Column("content_mode", sa.String(30), server_default="original", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("clone_jobs", "content_mode")
