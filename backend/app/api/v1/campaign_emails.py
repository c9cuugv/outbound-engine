import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import get_current_user
from app.api.v1.deps import get_or_404
from app.database import get_db
from app.models.user import User
from app.models.generated_email import GeneratedEmail
from app.models.lead import Lead
from app.models.campaign import Campaign
from app.models.template import EmailTemplate
from app.services.campaign_service import get_campaign_by_id

from app.ai.factory import get_provider
from app.ai.safe_generate import safe_generate
from app.ai.schemas import EmailOutput
from app.ai.prompts.email_gen import build_system_prompt, build_email_prompt

router = APIRouter(prefix="/api/v1/campaigns/{campaign_id}/emails", tags=["email-review"])


class EmailEditRequest(BaseModel):
    """Validated schema for email edit requests."""
    subject: str | None = Field(None, max_length=200)
    body: str | None = Field(None, max_length=5000)


@router.get("")
async def list_campaign_emails(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all generated emails for a campaign, grouped by lead then sequence step."""
    await get_or_404(get_campaign_by_id, db, campaign_id, current_user.id, detail="Campaign not found")
    result = await db.execute(
        select(GeneratedEmail)
        .where(GeneratedEmail.campaign_id == campaign_id)
        .order_by(GeneratedEmail.lead_id, GeneratedEmail.sequence_position)
    )
    emails = list(result.scalars().all())

    # Group by lead_id
    grouped: dict[str, list] = {}
    for email in emails:
        lead_key = str(email.lead_id)
        if lead_key not in grouped:
            grouped[lead_key] = []
        grouped[lead_key].append({
            "id": email.id,
            "sequence_position": email.sequence_position,
            "subject": email.subject,
            "body": email.body,
            "status": email.status,
            "was_manually_edited": email.was_manually_edited,
            "created_at": email.created_at,
        })

    return {"emails": grouped, "total": len(emails)}


@router.get("/{email_id}")
async def get_campaign_email(
    campaign_id: uuid.UUID,
    email_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single email with associated lead data."""
    await get_or_404(get_campaign_by_id, db, campaign_id, current_user.id, detail="Campaign not found")
    email_result = await db.execute(
        select(GeneratedEmail).where(
            GeneratedEmail.id == email_id,
            GeneratedEmail.campaign_id == campaign_id,
        )
    )
    email = email_result.scalar_one_or_none()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")

    # Get associated lead
    lead_result = await db.execute(select(Lead).where(Lead.id == email.lead_id))
    lead = lead_result.scalar_one_or_none()

    return {
        "email": {
            "id": email.id,
            "subject": email.subject,
            "subject_alternatives": email.subject_alternatives,
            "body": email.body,
            "body_original": email.body_original,
            "status": email.status,
            "was_manually_edited": email.was_manually_edited,
            "sequence_position": email.sequence_position,
            "created_at": email.created_at,
        },
        "lead": {
            "id": lead.id,
            "first_name": lead.first_name,
            "last_name": lead.last_name,
            "email": lead.email,
            "company_name": lead.company_name,
            "title": lead.title,
        } if lead else None,
    }


@router.patch("/{email_id}")
async def edit_email(
    campaign_id: uuid.UUID,
    email_id: uuid.UUID,
    data: EmailEditRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edit email subject/body. Preserves body_original, sets was_manually_edited."""
    await get_or_404(get_campaign_by_id, db, campaign_id, current_user.id, detail="Campaign not found")
    email_result = await db.execute(
        select(GeneratedEmail).where(
            GeneratedEmail.id == email_id,
            GeneratedEmail.campaign_id == campaign_id,
        )
    )
    email = email_result.scalar_one_or_none()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")

    if data.subject is not None:
        email.subject = data.subject
    if data.body is not None:
        email.body = data.body

    email.was_manually_edited = True
    await db.commit()
    await db.refresh(email)
    return {"id": email.id, "status": email.status, "was_manually_edited": True}


@router.post("/approve-all")
async def approve_all_emails(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk approve all draft emails in a campaign."""
    await get_or_404(get_campaign_by_id, db, campaign_id, current_user.id, detail="Campaign not found")
    result = await db.execute(
        update(GeneratedEmail)
        .where(
            GeneratedEmail.campaign_id == campaign_id,
            GeneratedEmail.status == "draft",
        )
        .values(status="approved")
        .returning(GeneratedEmail.id)
    )
    approved = len(result.fetchall())
    await db.commit()
    return {"approved": approved}


@router.post("/{email_id}/approve")
async def approve_email(
    campaign_id: uuid.UUID,
    email_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Approve a single email. Only draft emails can be approved."""
    await get_or_404(get_campaign_by_id, db, campaign_id, current_user.id, detail="Campaign not found")
    email_result = await db.execute(
        select(GeneratedEmail).where(
            GeneratedEmail.id == email_id,
            GeneratedEmail.campaign_id == campaign_id,
        )
    )
    email = email_result.scalar_one_or_none()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
    if email.status != "draft":
        raise HTTPException(status_code=400, detail=f"Cannot approve email in '{email.status}' status")

    email.status = "approved"
    await db.commit()
    return {"id": email.id, "status": "approved"}


@router.post("/{email_id}/regenerate")
async def regenerate_email(
    campaign_id: uuid.UUID,
    email_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Regenerate a single draft email inline."""
    campaign = await get_or_404(get_campaign_by_id, db, campaign_id, current_user.id, detail="Campaign not found")
    
    email_result = await db.execute(
        select(GeneratedEmail).where(
            GeneratedEmail.id == email_id,
            GeneratedEmail.campaign_id == campaign_id,
        )
    )
    email = email_result.scalar_one_or_none()
    if not email:
        raise HTTPException(status_code=404, detail="Email not found")
        
    # Get associated lead and template
    lead_result = await db.execute(select(Lead).where(Lead.id == email.lead_id))
    lead = lead_result.scalar_one_or_none()
    
    template_result = await db.execute(select(EmailTemplate).where(EmailTemplate.id == email.template_id))
    template = template_result.scalar_one_or_none()
    
    if not lead or not template:
        raise HTTPException(status_code=500, detail="Missing lead or template data")
        
    # Build prompt and regenerate
    provider = get_provider("email_gen")
    
    campaign_dict = {
        "product_name": campaign.product_name,
        "product_description": campaign.product_description,
        "icp_description": campaign.icp_description,
        "value_prop": campaign.value_prop,
        "max_word_count": template.max_word_count if hasattr(template, "max_word_count") else 120,
    }
    
    lead_dict = {
        "first_name": lead.first_name,
        "last_name": lead.last_name,
        "title": lead.title,
        "company_name": lead.company_name,
    }
    research_data = lead.research_data if hasattr(lead, "research_data") and lead.research_data else {}
    
    # We don't have previous context here easily, but for single regeneration it's ok to pass None
    tp_dict = {"sequence_position": template.sequence_position, "name": template.name}
    
    system_prompt = build_system_prompt(campaign_dict)
    user_prompt = build_email_prompt(tp_dict, lead_dict, research_data, previous_context=None)
    
    try:
        result = await safe_generate(
            provider=provider,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            output_schema=EmailOutput,
        )
        
        email.subject = result.subject_options[0]
        email.subject_alternatives = result.subject_options[1:] if len(result.subject_options) > 1 else []
        email.body = result.body
        email.body_original = result.body
        email.was_manually_edited = False
        
        await db.commit()
        await db.refresh(email)
        
        return {
            "id": email.id,
            "subject": email.subject,
            "body": email.body,
            "status": email.status,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


