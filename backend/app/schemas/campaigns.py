import uuid
from datetime import datetime, time
from pydantic import BaseModel, Field, field_validator


def _parse_time(v: object) -> time:
    if isinstance(v, time):
        return v
    if isinstance(v, str):
        # Accept "HH:MM" or "HH:MM:SS"
        parts = v.split(":")
        return time(int(parts[0]), int(parts[1]), int(parts[2]) if len(parts) > 2 else 0)
    raise ValueError(f"Cannot parse time value: {v!r}")


class CampaignCreate(BaseModel):
    name: str = Field(..., max_length=255)
    product_name: str | None = None
    product_description: str | None = None
    icp_description: str | None = None
    value_prop: str | None = None
    system_prompt: str | None = None
    sender_email: str | None = None
    sender_name: str | None = None
    reply_to_email: str | None = None
    sending_timezone: str = "America/New_York"
    sending_days: list[str] = ["mon", "tue", "wed", "thu", "fri"]
    sending_window_start: time = time(9, 0)
    sending_window_end: time = time(17, 0)
    max_emails_per_day: int = 50
    ab_test_enabled: bool = False

    @field_validator("sending_window_start", "sending_window_end", mode="before")
    @classmethod
    def coerce_time(cls, v: object) -> time:
        return _parse_time(v)


class CampaignUpdate(BaseModel):
    name: str | None = None
    product_name: str | None = None
    product_description: str | None = None
    icp_description: str | None = None
    value_prop: str | None = None
    system_prompt: str | None = None
    sender_email: str | None = None
    sender_name: str | None = None
    reply_to_email: str | None = None
    sending_timezone: str | None = None
    sending_days: list[str] | None = None
    max_emails_per_day: int | None = None


class CampaignResponse(BaseModel):
    id: uuid.UUID
    name: str
    product_name: str | None = None
    product_description: str | None = None
    icp_description: str | None = None
    value_prop: str | None = None
    sender_email: str | None = None
    sender_name: str | None = None
    reply_to_email: str | None = None
    sending_timezone: str
    sending_days: list[str]
    max_emails_per_day: int
    ab_test_enabled: bool
    status: str
    launched_at: datetime | None = None
    total_leads: int
    emails_sent: int
    emails_opened: int
    emails_clicked: int
    emails_replied: int
    emails_bounced: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TemplateCreate(BaseModel):
    name: str = Field(..., max_length=255)
    generation_prompt: str
    system_prompt: str | None = None
    max_word_count: int = 120
    tone: str = "professional-casual"
    sequence_position: int
    days_delay: int = 0


class TemplateUpdate(BaseModel):
    name: str | None = None
    generation_prompt: str | None = None
    system_prompt: str | None = None
    max_word_count: int | None = None
    tone: str | None = None
    days_delay: int | None = None


class TemplateResponse(BaseModel):
    id: uuid.UUID
    name: str
    generation_prompt: str
    system_prompt: str | None = None
    max_word_count: int
    tone: str
    sequence_position: int
    days_delay: int
    created_at: datetime

    class Config:
        from_attributes = True
