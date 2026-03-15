"""create generated_emails table

Revision ID: 005
Revises: 004
Create Date: 2026-03-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "generated_emails",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("lead_id", UUID(as_uuid=True), sa.ForeignKey("leads.id"), nullable=False),
        sa.Column("campaign_id", UUID(as_uuid=True), sa.ForeignKey("campaigns.id"), nullable=False),
        sa.Column("template_id", UUID(as_uuid=True), sa.ForeignKey("email_templates.id"), nullable=False),
        sa.Column("sequence_position", sa.Integer, nullable=False),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("subject_alternatives", JSONB),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("body_original", sa.Text, nullable=False),
        sa.Column("was_manually_edited", sa.Boolean, server_default="false"),
        sa.Column("status", sa.String(20), server_default="draft"),
        sa.Column("scheduled_at", sa.DateTime(timezone=True)),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("opened_at", sa.DateTime(timezone=True)),
        sa.Column("opened_count", sa.Integer, server_default="0"),
        sa.Column("clicked_at", sa.DateTime(timezone=True)),
        sa.Column("clicked_count", sa.Integer, server_default="0"),
        sa.Column("replied_at", sa.DateTime(timezone=True)),
        sa.Column("bounced_at", sa.DateTime(timezone=True)),
        sa.Column("bounce_type", sa.String(20)),
        sa.Column("variant_group", sa.String(10)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_emails_status", "generated_emails", ["status"])
    op.create_index("idx_emails_campaign", "generated_emails", ["campaign_id"])


def downgrade() -> None:
    op.drop_index("idx_emails_campaign", table_name="generated_emails")
    op.drop_index("idx_emails_status", table_name="generated_emails")
    op.drop_table("generated_emails")
