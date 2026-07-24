import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

_LINKEDIN_PREFIXES = ("https://linkedin.com/", "https://www.linkedin.com/")


_TAG_MAX_LENGTH = 50


def _validate_linkedin_url(v: str | None) -> str | None:
    if v is not None and not v.startswith(_LINKEDIN_PREFIXES):
        raise ValueError("linkedin_url must start with https://linkedin.com/ or https://www.linkedin.com/")
    return v


def _validate_tags(v: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for tag in v:
        tag = tag.strip()
        if len(tag) > _TAG_MAX_LENGTH:
            raise ValueError(f"each tag must be {_TAG_MAX_LENGTH} characters or fewer")
        if tag and tag not in seen:
            seen.add(tag)
            result.append(tag)
    return result


class LeadCreate(BaseModel):
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr = Field(..., max_length=255)
    company_name: str | None = Field(None, max_length=255)
    company_domain: str | None = Field(None, max_length=255)
    title: str | None = Field(None, max_length=255)
    linkedin_url: str | None = Field(None, max_length=500)
    tags: list[str] = Field(default_factory=list)
    custom_fields: dict = Field(default_factory=dict)
    source: str | None = Field(None, max_length=50)

    @field_validator("linkedin_url")
    @classmethod
    def validate_linkedin_url(cls, v: str | None) -> str | None:
        return _validate_linkedin_url(v)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: list[str]) -> list[str]:
        return _validate_tags(v)


class LeadUpdate(BaseModel):
    first_name: str | None = Field(None, min_length=1, max_length=100)
    last_name: str | None = Field(None, min_length=1, max_length=100)
    email: EmailStr | None = Field(None, max_length=255)
    company_name: str | None = Field(None, max_length=255)
    company_domain: str | None = Field(None, max_length=255)
    title: str | None = Field(None, max_length=255)
    linkedin_url: str | None = Field(None, max_length=500)
    status: Literal["new", "contacted", "replied", "bounced", "unsubscribed"] | None = None
    tags: list[str] | None = None
    custom_fields: dict | None = None

    @field_validator("linkedin_url")
    @classmethod
    def validate_linkedin_url(cls, v: str | None) -> str | None:
        return _validate_linkedin_url(v)

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        return _validate_tags(v)


class LeadResponse(BaseModel):
    id: uuid.UUID
    first_name: str
    last_name: str
    email: str
    company_name: str | None = None
    company_domain: str | None = None
    title: str | None = None
    linkedin_url: str | None = None
    company_description: str | None = None
    company_industry: str | None = None
    company_size: str | None = None
    company_funding_stage: str | None = None
    company_tech_stack: list | None = None
    recent_news: list | None = None
    pain_points: list | None = None
    status: str
    research_status: str
    research_completed_at: datetime | None = None
    tags: list = Field(default_factory=list)
    custom_fields: dict = Field(default_factory=dict)
    source: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedResponse(BaseModel):
    items: list[LeadResponse]
    total_count: int
    page: int
    per_page: int
    total_pages: int
