"""create campaigns table

Revision ID: 003
Revises: 002
Create Date: 2026-03-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "campaigns",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("product_name", sa.String(255)),
        sa.Column("product_description", sa.Text),
        sa.Column("icp_description", sa.Text),
        sa.Column("value_prop", sa.Text),
        sa.Column("system_prompt", sa.Text),
        sa.Column("sender_email", sa.String(255)),
        sa.Column("sender_name", sa.String(255)),
        sa.Column("reply_to_email", sa.String(255)),
        sa.Column("sending_timezone", sa.String(50), server_default="America/New_York"),
        sa.Column("sending_days", JSONB, server_default='["mon","tue","wed","thu","fri"]'),
        sa.Column("sending_window_start", sa.Time, server_default=sa.text("'09:00'")),
        sa.Column("sending_window_end", sa.Time, server_default=sa.text("'17:00'")),
        sa.Column("max_emails_per_day", sa.Integer, server_default="50"),
        sa.Column("min_delay_between_emails_seconds", sa.Integer, server_default="60"),
        sa.Column("ab_test_enabled", sa.Boolean, server_default="false"),
        sa.Column("ab_split_percentage", sa.Integer, server_default="50"),
        sa.Column("status", sa.String(20), server_default="draft"),
        sa.Column("total_leads", sa.Integer, server_default="0"),
        sa.Column("emails_sent", sa.Integer, server_default="0"),
        sa.Column("emails_opened", sa.Integer, server_default="0"),
        sa.Column("emails_clicked", sa.Integer, server_default="0"),
        sa.Column("emails_replied", sa.Integer, server_default="0"),
        sa.Column("emails_bounced", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_campaigns_status", "campaigns", ["status"])


def downgrade() -> None:
    op.drop_index("idx_campaigns_status", table_name="campaigns")
    op.drop_table("campaigns")
