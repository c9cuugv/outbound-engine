"""create tracking_events table

Revision ID: 006
Revises: 005
Create Date: 2026-03-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tracking_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email_id", UUID(as_uuid=True), sa.ForeignKey("generated_emails.id"), nullable=False),
        sa.Column("event_type", sa.String(20), nullable=False),
        sa.Column("ip_address", sa.String(45)),
        sa.Column("user_agent", sa.Text),
        sa.Column("link_url", sa.Text),
        sa.Column("metadata", JSONB),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_tracking_email", "tracking_events", ["email_id"])
    op.create_index("idx_tracking_type", "tracking_events", ["event_type"])
    op.create_index("idx_tracking_created", "tracking_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("idx_tracking_created", table_name="tracking_events")
    op.drop_index("idx_tracking_type", table_name="tracking_events")
    op.drop_index("idx_tracking_email", table_name="tracking_events")
    op.drop_table("tracking_events")
