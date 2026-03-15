import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ListCreate(BaseModel):
    name: str = Field(..., max_length=255)
    description: str | None = None
    is_dynamic: bool = False
    filter_criteria: dict | None = None


class ListResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    filter_criteria: dict | None = None
    is_dynamic: bool
    member_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class AddLeadsRequest(BaseModel):
    lead_ids: list[uuid.UUID]
