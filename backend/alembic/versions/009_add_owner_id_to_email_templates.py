"""add owner_id to email_templates

Revision ID: 009
Revises: 008
Create Date: 2026-05-23
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "email_templates",
        sa.Column("owner_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
    )
    op.create_index(op.f("ix_email_templates_owner_id"), "email_templates", ["owner_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_email_templates_owner_id"), table_name="email_templates")
    op.drop_column("email_templates", "owner_id")