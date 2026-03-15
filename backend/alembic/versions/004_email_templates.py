"""create email_templates table

Revision ID: 004
Revises: 003
Create Date: 2026-03-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "email_templates",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("system_prompt", sa.Text),
        sa.Column("generation_prompt", sa.Text, nullable=False),
        sa.Column("max_word_count", sa.Integer, server_default="120"),
        sa.Column("tone", sa.String(50), server_default="professional-casual"),
        sa.Column("sequence_position", sa.Integer, nullable=False),
        sa.Column("days_delay", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )


def downgrade() -> None:
    op.drop_table("email_templates")
