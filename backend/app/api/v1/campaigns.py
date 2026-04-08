import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import get_current_user
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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await get_campaigns(db, owner_id=current_user.id)


@router.get("/campaigns/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    campaign = await get_campaign_by_id(db, campaign_id, owner_id=current_user.id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


@router.patch("/campaigns/{campaign_id}", response_model=CampaignResponse)
async def update_campaign_endpoint(
    campaign_id: uuid.UUID,
    data: CampaignUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    campaign = await get_campaign_by_id(db, campaign_id, owner_id=current_user.id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status == "active":
        raise HTTPException(status_code=400, detail="Cannot update an active campaign")

    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    return await update_campaign(db, campaign, update_data)


@router.post("/campaigns/{campaign_id}/generate", response_model=CampaignResponse)
async def generate_campaign_emails_endpoint(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trigger email generation for a campaign. Dispatches background task and sets status to 'generating'."""
    campaign = await get_campaign_by_id(db, campaign_id, owner_id=current_user.id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    campaign = await update_campaign(db, campaign, {"status": "generating"})
    generate_campaign_emails.delay(str(campaign_id))
    return campaign


@router.post("/campaigns/{campaign_id}/launch", response_model=CampaignResponse)
async def launch_campaign(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set campaign status to 'active' and record launched_at timestamp."""
    campaign = await get_campaign_by_id(db, campaign_id, owner_id=current_user.id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

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
    """Set campaign status to 'paused'."""
    campaign = await get_campaign_by_id(db, campaign_id, owner_id=current_user.id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    return await update_campaign(db, campaign, {"status": "paused"})


@router.post("/campaigns/{campaign_id}/resume", response_model=CampaignResponse)
async def resume_campaign(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set campaign status back to 'active'."""
    campaign = await get_campaign_by_id(db, campaign_id, owner_id=current_user.id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    return await update_campaign(db, campaign, {"status": "active"})


# ── Template Endpoints ──

@router.post("/templates", response_model=TemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template_endpoint(
    data: TemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await create_template(db, data.model_dump(), owner_id=current_user.id)


@router.get("/templates", response_model=list[TemplateResponse])
async def list_templates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await get_templates(db, owner_id=current_user.id)


@router.get("/templates/{template_id}", response_model=TemplateResponse)
async def get_template(
    template_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = await get_template_by_id(db, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.patch("/templates/{template_id}", response_model=TemplateResponse)
async def update_template_endpoint(
    template_id: uuid.UUID,
    data: TemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = await get_template_by_id(db, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    update_data = data.model_dump(exclude_unset=True)
    return await update_template(db, template, update_data)
