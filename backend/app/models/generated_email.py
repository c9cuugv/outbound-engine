import uuid
from datetime import datetime

from sqlalchemy import String, Text, Integer, Boolean, DateTime, Float, Index, ForeignKey, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class GeneratedEmail(Base):
    __tablename__ = "generated_emails"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    lead_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("leads.id"))
    campaign_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("campaigns.id"))
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("email_templates.id"))

    sequence_position: Mapped[int] = mapped_column(Integer)
    subject: Mapped[str] = mapped_column(String(500))
    subject_alternatives: Mapped[dict | None] = mapped_column(JSONB)
    body: Mapped[str] = mapped_column(Text)
    body_original: Mapped[str] = mapped_column(Text)  # preserved for comparison
    was_manually_edited: Mapped[bool] = mapped_column(Boolean, default=False)

    # Lifecycle
    status: Mapped[str] = mapped_column(String(20), default="draft")
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Tracking
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    opened_count: Mapped[int] = mapped_column(Integer, default=0)
    clicked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    clicked_count: Mapped[int] = mapped_column(Integer, default=0)
    replied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    bounced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    bounce_type: Mapped[str | None] = mapped_column(String(20))

    # A/B testing
    variant_group: Mapped[str | None] = mapped_column(String(10))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_emails_status", "status"),
        Index("idx_emails_scheduled", "scheduled_at", postgresql_where=text("status = 'scheduled'")),
        Index("idx_emails_campaign", "campaign_id"),
    )
