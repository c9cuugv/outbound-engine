import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class LeadCreate(BaseModel):
    first_name: str = Field(..., max_length=100)
    last_name: str = Field(..., max_length=100)
    email: str = Field(..., max_length=255)
    company_name: str | None = Field(None, max_length=255)
    company_domain: str | None = Field(None, max_length=255)
    title: str | None = Field(None, max_length=255)
    linkedin_url: str | None = Field(None, max_length=500)
    tags: list[str] = Field(default_factory=list)
    custom_fields: dict = Field(default_factory=dict)
    source: str | None = Field(None, max_length=50)


class LeadUpdate(BaseModel):
    first_name: str | None = Field(None, max_length=100)
    last_name: str | None = Field(None, max_length=100)
    email: str | None = Field(None, max_length=255)
    company_name: str | None = Field(None, max_length=255)
    company_domain: str | None = Field(None, max_length=255)
    title: str | None = Field(None, max_length=255)
    linkedin_url: str | None = Field(None, max_length=500)
    status: str | None = Field(None, max_length=20)
    tags: list[str] | None = None
    custom_fields: dict | None = None


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
    tags: list = []
    custom_fields: dict = {}
    source: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PaginatedResponse(BaseModel):
    items: list[LeadResponse]
    total_count: int
    page: int
    per_page: int
    total_pages: int
