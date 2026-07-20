import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import get_current_user
from app.api.v1.deps import get_or_404
from app.database import get_db
from app.models.user import User
from app.schemas.campaigns import (
    CampaignCreate, CampaignUpdate, CampaignResponse,
    TemplateCreate, TemplateUpdate, TemplateResponse,
)
from app.services.campaign_service import (
    create_campaign, get_campaign_by_id, get_campaigns, update_campaign,
    create_template, get_templates, get_template_by_id, update_template,
)
from app.workers.email_gen_tasks import generate_campaign_emails

router = APIRouter(prefix="/api/v1", tags=["campaigns"])


# ── Campaign Endpoints ──

@router.post("/campaigns", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
async def create_campaign_endpoint(
    data: CampaignCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    campaign = await create_campaign(db, {**data.model_dump(), "owner_id": current_user.id})
    return campaign


@router.get("/campaigns", response_model=list[CampaignResponse])
async def list_campaigns(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await get_campaigns(db, owner_id=current_user.id, limit=limit, offset=offset, status=status)


@router.get("/campaigns/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await get_or_404(get_campaign_by_id, db, campaign_id, current_user.id, detail="Campaign not found")


@router.patch("/campaigns/{campaign_id}", response_model=CampaignResponse)
async def update_campaign_endpoint(
    campaign_id: uuid.UUID,
    data: CampaignUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    campaign = await get_or_404(get_campaign_by_id, db, campaign_id, current_user.id, detail="Campaign not found")
    if campaign.status == "active":
        raise HTTPException(status_code=400, detail="Cannot update an active campaign")

    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    return await update_campaign(db, campaign, update_data)


@router.post("/campaigns/{campaign_id}/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate_campaign(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trigger the background task to generate emails for all eligible leads."""
    campaign = await get_or_404(get_campaign_by_id, db, campaign_id, current_user.id, detail="Campaign not found")
    
    # Update status to generating
    await update_campaign(db, campaign, {"status": "generating"})
    
    # Trigger Celery task
    generate_campaign_emails.delay(str(campaign.id))
    return {"status": "accepted", "message": "Email generation queued"}


@router.post("/campaigns/{campaign_id}/launch", response_model=CampaignResponse)
async def launch_campaign(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set campaign status to 'active' and record launched_at timestamp."""
    campaign = await get_or_404(get_campaign_by_id, db, campaign_id, current_user.id, detail="Campaign not found")
    if campaign.status == "active":
        raise HTTPException(status_code=400, detail="Campaign is already active")
    return await update_campaign(db, campaign, {
        "status": "active",
        "launched_at": datetime.now(timezone.utc),
    })


@router.post("/campaigns/{campaign_id}/pause", response_model=CampaignResponse)
async def pause_campaign(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    campaign = await get_or_404(get_campaign_by_id, db, campaign_id, current_user.id, detail="Campaign not found")
    if campaign.status != "active":
        raise HTTPException(status_code=400, detail="Only active campaigns can be paused")
    return await update_campaign(db, campaign, {"status": "paused"})


@router.post("/campaigns/{campaign_id}/resume", response_model=CampaignResponse)
async def resume_campaign(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    campaign = await get_or_404(get_campaign_by_id, db, campaign_id, current_user.id, detail="Campaign not found")
    if campaign.status != "paused":
        raise HTTPException(status_code=400, detail="Only paused campaigns can be resumed")
    return await update_campaign(db, campaign, {"status": "active"})


# ── Template Endpoints ──

@router.post("/templates", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template_endpoint(
    data: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await create_template(db, {**data.model_dump(), "owner_id": current_user.id})


@router.get("/templates", response_model=list[TemplateResponse])
async def list_templates(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await get_templates(db, owner_id=current_user.id, limit=limit, offset=offset)


@router.get("/templates/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await get_or_404(get_template_by_id, db, template_id, detail="Template not found")


@router.patch("/templates/{template_id}", response_model=TemplateResponse)
async def update_template_endpoint(
    template_id: uuid.UUID,
    data: TemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = await get_or_404(get_template_by_id, db, template_id, detail="Template not found")
    update_data = data.model_dump(exclude_unset=True)
    return await update_template(db, template, update_data)
