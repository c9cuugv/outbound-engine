import uuid

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.campaign import Campaign
from app.models.template import EmailTemplate


# ── Campaign Service ──

async def create_campaign(db: AsyncSession, data: dict) -> Campaign:
    campaign = Campaign(**data)
    db.add(campaign)
    await db.commit()
    await db.refresh(campaign)
    return campaign


async def get_campaign_by_id(
    db: AsyncSession, campaign_id: uuid.UUID, owner_id: uuid.UUID
) -> Campaign | None:
    result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id, Campaign.owner_id == owner_id)
    )
    return result.scalar_one_or_none()


async def get_campaigns(db: AsyncSession, owner_id: uuid.UUID) -> list[Campaign]:
    result = await db.execute(
        select(Campaign)
        .where(Campaign.owner_id == owner_id)
        .order_by(Campaign.created_at.desc())
    )
    return list(result.scalars().all())


async def update_campaign(db: AsyncSession, campaign: Campaign, data: dict) -> Campaign:
    for key, value in data.items():
        setattr(campaign, key, value)
    await db.commit()
    await db.refresh(campaign)
    return campaign


# ── Template Service ──

async def create_template(db: AsyncSession, data: dict, owner_id=None) -> EmailTemplate:
    template = EmailTemplate(**data)
    if owner_id is not None:
        template.owner_id = owner_id
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


async def get_templates(db: AsyncSession, owner_id=None) -> list[EmailTemplate]:
    query = select(EmailTemplate)
    if owner_id is not None:
        query = query.where(EmailTemplate.owner_id == owner_id)
    query = query.order_by(EmailTemplate.sequence_position)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_template_by_id(db: AsyncSession, template_id: uuid.UUID) -> EmailTemplate | None:
    result = await db.execute(select(EmailTemplate).where(EmailTemplate.id == template_id))
    return result.scalar_one_or_none()


async def update_template(db: AsyncSession, template: EmailTemplate, data: dict) -> EmailTemplate:
    for key, value in data.items():
        if value is not None:
            setattr(template, key, value)
    await db.commit()
    await db.refresh(template)
    return template
