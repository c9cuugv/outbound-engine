import uuid
from datetime import datetime, time

from sqlalchemy import String, Text, Integer, Float, Boolean, DateTime, Time, Index, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # Owner — every campaign belongs to a user
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Product context for AI
    product_name: Mapped[str | None] = mapped_column(String(255))
    product_description: Mapped[str | None] = mapped_column(Text)
    icp_description: Mapped[str | None] = mapped_column(Text)
    value_prop: Mapped[str | None] = mapped_column(Text)
    system_prompt: Mapped[str | None] = mapped_column(Text)

    # Sender identity
    sender_email: Mapped[str | None] = mapped_column(String(255))
    sender_name: Mapped[str | None] = mapped_column(String(255))
    reply_to_email: Mapped[str | None] = mapped_column(String(255))

    # Scheduling config
    sending_timezone: Mapped[str] = mapped_column(String(50), default="America/New_York")
    sending_days: Mapped[dict] = mapped_column(JSONB, default=lambda: ["mon", "tue", "wed", "thu", "fri"])
    sending_window_start: Mapped[time | None] = mapped_column(Time, default=time(9, 0))
    sending_window_end: Mapped[time | None] = mapped_column(Time, default=time(17, 0))
    max_emails_per_day: Mapped[int] = mapped_column(Integer, default=50)
    min_delay_between_emails_seconds: Mapped[int] = mapped_column(Integer, default=60)

    # A/B testing
    ab_test_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    ab_split_percentage: Mapped[int] = mapped_column(Integer, default=50)

    # Status
    status: Mapped[str] = mapped_column(String(20), default="draft")
    launched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Stats (denormalized for performance)
    total_leads: Mapped[int] = mapped_column(Integer, default=0)
    emails_sent: Mapped[int] = mapped_column(Integer, default=0)
    emails_opened: Mapped[int] = mapped_column(Integer, default=0)
    emails_clicked: Mapped[int] = mapped_column(Integer, default=0)
    emails_replied: Mapped[int] = mapped_column(Integer, default=0)
    emails_bounced: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_campaigns_status", "status"),
    )
