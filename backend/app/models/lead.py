import uuid
from datetime import datetime

from sqlalchemy import String, Text, Boolean, DateTime, Index, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class Lead(Base):
    __tablename__ = "leads"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Owner — every lead belongs to a user
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    company_name: Mapped[str | None] = mapped_column(String(255))
    company_domain: Mapped[str | None] = mapped_column(String(255))
    title: Mapped[str | None] = mapped_column(String(255))
    linkedin_url: Mapped[str | None] = mapped_column(String(500))

    # Enrichment fields (populated by research module)
    company_description: Mapped[str | None] = mapped_column(Text)
    company_industry: Mapped[str | None] = mapped_column(String(100))
    company_size: Mapped[str | None] = mapped_column(String(50))
    company_funding_stage: Mapped[str | None] = mapped_column(String(50))
    company_tech_stack: Mapped[dict | None] = mapped_column(JSONB)
    recent_news: Mapped[dict | None] = mapped_column(JSONB)
    pain_points: Mapped[dict | None] = mapped_column(JSONB)

    # Status tracking
    status: Mapped[str] = mapped_column(String(20), default="new")
    research_status: Mapped[str] = mapped_column(String(20), default="pending")
    research_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Metadata
    tags: Mapped[dict] = mapped_column(JSONB, default=list)
    custom_fields: Mapped[dict] = mapped_column(JSONB, default=dict)
    source: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_leads_status", "status"),
        Index("idx_leads_company_domain", "company_domain"),
        Index("idx_leads_research_status", "research_status"),
    )


class LeadList(Base):
    __tablename__ = "lead_lists"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Owner — every list belongs to a user
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    filter_criteria: Mapped[dict | None] = mapped_column(JSONB)
    is_dynamic: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class LeadListMember(Base):
    __tablename__ = "lead_list_members"

    lead_list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
    )
    lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
    )
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
