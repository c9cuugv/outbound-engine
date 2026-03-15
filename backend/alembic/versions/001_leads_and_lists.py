"""create leads and lists tables

Revision ID: 001
Revises:
Create Date: 2026-03-12
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── leads table ──
    op.create_table(
        "leads",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("first_name", sa.String(100), nullable=False),
        sa.Column("last_name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("company_name", sa.String(255)),
        sa.Column("company_domain", sa.String(255)),
        sa.Column("title", sa.String(255)),
        sa.Column("linkedin_url", sa.String(500)),
        sa.Column("company_description", sa.Text),
        sa.Column("company_industry", sa.String(100)),
        sa.Column("company_size", sa.String(50)),
        sa.Column("company_funding_stage", sa.String(50)),
        sa.Column("company_tech_stack", JSONB),
        sa.Column("recent_news", JSONB),
        sa.Column("pain_points", JSONB),
        sa.Column("status", sa.String(20), server_default="new"),
        sa.Column("research_status", sa.String(20), server_default="pending"),
        sa.Column("research_completed_at", sa.DateTime(timezone=True)),
        sa.Column("tags", JSONB, server_default="[]"),
        sa.Column("custom_fields", JSONB, server_default="{}"),
        sa.Column("source", sa.String(50)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_leads_status", "leads", ["status"])
    op.create_index("idx_leads_company_domain", "leads", ["company_domain"])
    op.create_index("idx_leads_research_status", "leads", ["research_status"])

    # ── lead_lists table ──
    op.create_table(
        "lead_lists",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("filter_criteria", JSONB),
        sa.Column("is_dynamic", sa.Boolean, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    # ── lead_list_members table ──
    op.create_table(
        "lead_list_members",
        sa.Column("lead_list_id", UUID(as_uuid=True), sa.ForeignKey("lead_lists.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("lead_id", UUID(as_uuid=True), sa.ForeignKey("leads.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )


def downgrade() -> None:
    op.drop_table("lead_list_members")
    op.drop_table("lead_lists")
    op.drop_index("idx_leads_research_status", table_name="leads")
    op.drop_index("idx_leads_company_domain", table_name="leads")
    op.drop_index("idx_leads_status", table_name="leads")
    op.drop_table("leads")
