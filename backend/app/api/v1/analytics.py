import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.campaign import Campaign
from app.models.generated_email import GeneratedEmail
from app.models.tracking_event import TrackingEvent
from app.models.reply import Reply

router = APIRouter(prefix="/api/v1/campaigns", tags=["analytics"])


@router.get("/{campaign_id}/analytics")
async def get_campaign_analytics(
    campaign_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get comprehensive campaign analytics: overview, by_step, by_day, top_subjects, sentiment."""
    campaign = await _get_campaign(db, campaign_id, current_user.id)

    # ── Overview ──
    emails_sent = campaign.emails_sent or 0
    overview = {
        "total_leads": campaign.total_leads,
        "emails_sent": emails_sent,
        "emails_opened": campaign.emails_opened,
        "emails_clicked": campaign.emails_clicked,
        "emails_replied": campaign.emails_replied,
        "emails_bounced": campaign.emails_bounced,
        "open_rate": round(campaign.emails_opened / emails_sent, 4) if emails_sent > 0 else 0.0,
        "click_rate": round(campaign.emails_clicked / emails_sent, 4) if emails_sent > 0 else 0.0,
        "reply_rate": round(campaign.emails_replied / emails_sent, 4) if emails_sent > 0 else 0.0,
        "bounce_rate": round(campaign.emails_bounced / emails_sent, 4) if emails_sent > 0 else 0.0,
    }

    # ── By Sequence Step ──
    step_result = await db.execute(
        select(
            GeneratedEmail.sequence_position,
            func.count().filter(GeneratedEmail.status == "sent").label("sent"),
            func.count().filter(GeneratedEmail.opened_at.isnot(None)).label("opened"),
            func.count().filter(GeneratedEmail.clicked_at.isnot(None)).label("clicked"),
            func.count().filter(GeneratedEmail.replied_at.isnot(None)).label("replied"),
        )
        .where(GeneratedEmail.campaign_id == campaign_id)
        .group_by(GeneratedEmail.sequence_position)
        .order_by(GeneratedEmail.sequence_position)
    )
    by_step = [
        {
            "step": row.sequence_position,
            "sent": row.sent,
            "opened": row.opened,
            "clicked": row.clicked,
            "replied": row.replied,
        }
        for row in step_result.all()
    ]

    # ── By Day ──
    day_result = await db.execute(
        select(
            cast(GeneratedEmail.sent_at, Date).label("date"),
            func.count().label("sent"),
            func.count().filter(GeneratedEmail.opened_at.isnot(None)).label("opened"),
        )
        .where(
            GeneratedEmail.campaign_id == campaign_id,
            GeneratedEmail.sent_at.isnot(None),
        )
        .group_by(cast(GeneratedEmail.sent_at, Date))
        .order_by(cast(GeneratedEmail.sent_at, Date))
    )
    by_day = [
        {"date": str(row.date), "sent": row.sent, "opened": row.opened}
        for row in day_result.all()
    ]

    # ── Top Performing Subjects ──
    subject_result = await db.execute(
        select(
            GeneratedEmail.subject,
            func.count().label("total_sent"),
            func.count().filter(GeneratedEmail.opened_at.isnot(None)).label("opens"),
        )
        .where(
            GeneratedEmail.campaign_id == campaign_id,
            GeneratedEmail.status == "sent",
        )
        .group_by(GeneratedEmail.subject)
        .having(func.count() >= 10)
        .order_by(func.count().filter(GeneratedEmail.opened_at.isnot(None)).desc())
        .limit(10)
    )
    top_subjects = [
        {
            "subject": row.subject,
            "sent": row.total_sent,
            "opens": row.opens,
            "open_rate": round(row.opens / row.total_sent, 4) if row.total_sent > 0 else 0.0,
        }
        for row in subject_result.all()
    ]

    # ── Reply Sentiment Breakdown ──
    sentiment_result = await db.execute(
        select(
            Reply.sentiment,
            func.count().label("count"),
        )
        .join(GeneratedEmail, Reply.email_id == GeneratedEmail.id)
        .where(GeneratedEmail.campaign_id == campaign_id)
        .group_by(Reply.sentiment)
    )
    sentiment_breakdown = {row.sentiment: row.count for row in sentiment_result.all()}

    return {
        "overview": overview,
        "by_sequence_step": by_step,
        "by_day": by_day,
        "top_performing_subjects": top_subjects,
        "reply_sentiment_breakdown": sentiment_breakdown,
    }


@router.get("/{campaign_id}/leads/{lead_id}/timeline")
async def get_lead_timeline(
    campaign_id: uuid.UUID,
    lead_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get chronological event timeline for a single lead within a campaign."""
    # Ownership check — 404 if campaign does not belong to current user
    await _get_campaign(db, campaign_id, current_user.id)

    # Get all emails for this lead in the campaign
    emails_result = await db.execute(
        select(GeneratedEmail).where(
            GeneratedEmail.campaign_id == campaign_id,
            GeneratedEmail.lead_id == lead_id,
        ).order_by(GeneratedEmail.sequence_position)
    )
    emails = list(emails_result.scalars().all())

    timeline = []

    for eml in emails:
        # Email created
        timeline.append({
            "type": "email_generated",
            "timestamp": str(eml.created_at),
            "data": {"subject": eml.subject, "step": eml.sequence_position},
        })

        # Email sent
        if eml.sent_at:
            timeline.append({
                "type": "email_sent",
                "timestamp": str(eml.sent_at),
                "data": {"subject": eml.subject},
            })

        # Opened
        if eml.opened_at:
            timeline.append({
                "type": "email_opened",
                "timestamp": str(eml.opened_at),
                "data": {"open_count": eml.opened_count},
            })

        # Clicked
        if eml.clicked_at:
            timeline.append({
                "type": "email_clicked",
                "timestamp": str(eml.clicked_at),
                "data": {"click_count": eml.clicked_count},
            })

        # Replied
        if eml.replied_at:
            timeline.append({
                "type": "email_replied",
                "timestamp": str(eml.replied_at),
                "data": {},
            })

        # Bounced
        if eml.bounced_at:
            timeline.append({
                "type": "email_bounced",
                "timestamp": str(eml.bounced_at),
                "data": {"bounce_type": eml.bounce_type},
            })

    # Sort by timestamp
    timeline.sort(key=lambda x: x["timestamp"])

    return {"lead_id": str(lead_id), "campaign_id": str(campaign_id), "timeline": timeline}


async def _get_campaign(
    db: AsyncSession, campaign_id: uuid.UUID, owner_id: uuid.UUID
) -> Campaign:
    result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id, Campaign.owner_id == owner_id)
    )
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign
