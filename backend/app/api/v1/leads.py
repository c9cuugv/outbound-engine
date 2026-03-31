import math
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import get_current_user
from app.database import get_db
from app.models.lead import Lead
from app.models.user import User
from app.schemas.leads import LeadCreate, LeadUpdate, LeadResponse, PaginatedResponse
from app.services.lead_service import (
    create_lead,
    get_lead_by_id,
    get_leads_paginated,
    update_lead,
    soft_delete_lead,
)
from app.workers.research_tasks import research_lead

router = APIRouter(prefix="/api/v1/leads", tags=["leads"])


@router.post("", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
async def create_lead_endpoint(
    data: LeadCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a single lead. Returns 409 on duplicate email."""
    try:
        lead = await create_lead(db, {**data.model_dump(), "owner_id": current_user.id})
    except IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Lead with this email already exists",
        )
    return lead


@router.get("", response_model=PaginatedResponse)
async def list_leads(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    sort: str = Query("created_at"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    status_filter: str | None = Query(None, alias="status"),
    research_status: str | None = Query(None),
    company_domain: str | None = Query(None),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List leads with pagination, sorting, and filtering."""
    leads, total_count = await get_leads_paginated(
        db,
        owner_id=current_user.id,
        page=page,
        per_page=per_page,
        sort=sort,
        order=order,
        status=status_filter,
        research_status=research_status,
        company_domain=company_domain,
        search=search,
    )
    total_pages = math.ceil(total_count / per_page) if total_count > 0 else 0

    return PaginatedResponse(
        items=leads,
        total_count=total_count,
        page=page,
        per_page=per_page,
        total_pages=total_pages,
    )


@router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead(
    lead_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single lead with all fields."""
    lead = await get_lead_by_id(db, lead_id, current_user.id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.patch("/{lead_id}", response_model=LeadResponse)
async def update_lead_endpoint(
    lead_id: uuid.UUID,
    data: LeadUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Partial update — only provided fields are changed."""
    lead = await get_lead_by_id(db, lead_id, current_user.id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        updated = await update_lead(db, lead, update_data)
    except IntegrityError:
        raise HTTPException(
            status_code=409, detail="Lead with this email already exists"
        )
    return updated


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead(
    lead_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft delete: sets status to 'deleted'."""
    lead = await get_lead_by_id(db, lead_id, current_user.id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    await soft_delete_lead(db, lead)


@router.post("/research/all")
async def research_all_leads(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trigger background research for all leads with status 'new'. Returns count queued."""
    result = await db.execute(
        select(Lead).where(Lead.owner_id == current_user.id, Lead.status == "new")
    )
    leads = list(result.scalars().all())

    for lead in leads:
        research_lead.delay(str(lead.id))

    return {"queued": len(leads)}
