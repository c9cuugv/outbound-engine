import math
import uuid

from sqlalchemy import select, func, and_, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lead import Lead


async def create_lead(db: AsyncSession, data: dict) -> Lead:
    """Create a single lead. Caller handles duplicate email exceptions."""
    lead = Lead(**data)
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    return lead


async def get_lead_by_id(
    db: AsyncSession, lead_id: uuid.UUID, owner_id: uuid.UUID
) -> Lead | None:
    result = await db.execute(
        select(Lead).where(Lead.id == lead_id, Lead.owner_id == owner_id)
    )
    return result.scalar_one_or_none()


async def get_lead_by_email(db: AsyncSession, email: str) -> Lead | None:
    result = await db.execute(select(Lead).where(Lead.email == email))
    return result.scalar_one_or_none()


async def get_leads_paginated(
    db: AsyncSession,
    owner_id: uuid.UUID,
    page: int = 1,
    per_page: int = 50,
    sort: str = "created_at",
    order: str = "desc",
    status: str | None = None,
    research_status: str | None = None,
    company_domain: str | None = None,
    search: str | None = None,
) -> tuple[list[Lead], int]:
    """Returns (leads, total_count) with pagination, filtering, and sorting."""

    # Build base query with filters
    filters = []
    # Always scope to the requesting user's leads
    filters.append(Lead.owner_id == owner_id)
    # Exclude soft-deleted leads from listing by default
    filters.append(Lead.status != "deleted")

    if status:
        filters.append(Lead.status == status)
    if research_status:
        filters.append(Lead.research_status == research_status)
    if company_domain:
        filters.append(Lead.company_domain == company_domain)
    if search:
        search_pattern = f"%{search}%"
        filters.append(
            (Lead.first_name.ilike(search_pattern))
            | (Lead.last_name.ilike(search_pattern))
            | (Lead.email.ilike(search_pattern))
            | (Lead.company_name.ilike(search_pattern))
        )

    where_clause = and_(*filters) if filters else True

    # Count query
    count_query = select(func.count()).select_from(Lead).where(where_clause)
    total_result = await db.execute(count_query)
    total_count = total_result.scalar()

    # Sort — whitelist allowed columns to prevent attribute injection
    _SORTABLE_COLUMNS = {
        "created_at", "updated_at", "first_name", "last_name",
        "email", "company_name", "company_domain", "title", "status",
    }
    if sort not in _SORTABLE_COLUMNS:
        sort = "created_at"
    sort_column = getattr(Lead, sort)
    order_func = desc if order == "desc" else asc

    # Data query
    query = (
        select(Lead)
        .where(where_clause)
        .order_by(order_func(sort_column))
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(query)
    leads = list(result.scalars().all())

    return leads, total_count


async def update_lead(db: AsyncSession, lead: Lead, data: dict) -> Lead:
    """Partial update: only set provided fields."""
    for key, value in data.items():
        if value is not None:
            setattr(lead, key, value)
    await db.commit()
    await db.refresh(lead)
    return lead


async def soft_delete_lead(db: AsyncSession, lead: Lead) -> Lead:
    """Soft delete by setting status to 'deleted'."""
    lead.status = "deleted"
    await db.commit()
    await db.refresh(lead)
    return lead
