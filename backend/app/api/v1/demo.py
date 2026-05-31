"""
Demo-only endpoints — synthetic data injection for verifying M6 reply
classification without a live IMAP mailbox.
"""

import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import get_current_user
from app.database import get_db
from app.models.campaign import Campaign
from app.models.generated_email import GeneratedEmail
from app.models.lead import Lead
from app.models.reply import Reply
from app.models.user import User
from app.workers.send_tasks import cancel_remaining_sequence

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/demo", tags=["demo"])


class InjectReplyRequest(BaseModel):
    campaign_email_id: str
    reply_text: str = "Thanks for reaching out — I'd love to learn more. Can we schedule a call?"


class InjectReplyResponse(BaseModel):
    reply_id: str
    sentiment: str
    confidence: float
    message: str


@router.post(
    "/inject-reply",
    response_model=InjectReplyResponse,
    status_code=status.HTTP_201_CREATED,
)
async def inject_reply(
    body: InjectReplyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Inject a synthetic inbound reply to exercise the full M6 pipeline.

    Runs identical logic to the IMAP poller: updates email/lead status,
    cancels the remaining sequence, classifies sentiment via AI, and
    stores the Reply record.
    """
    email_uuid = uuid.UUID(body.campaign_email_id)
    result = await db.execute(select(GeneratedEmail).where(GeneratedEmail.id == email_uuid))
    email = result.scalar_one_or_none()
    if not email:
        raise HTTPException(status_code=404, detail="Campaign email not found")

    lead_result = await db.execute(select(Lead).where(Lead.id == email.lead_id))
    lead = lead_result.scalar_one_or_none()

    # 1. Mark email as replied
    email.status = "replied"
    email.replied_at = datetime.now(timezone.utc)

    # 2. Mark lead as replied
    if lead:
        lead.status = "replied"

    # 3. Cancel remaining sequence steps
    await cancel_remaining_sequence(db, email.lead_id, email.campaign_id)

    # 4. Increment campaign reply counter
    campaign_result = await db.execute(select(Campaign).where(Campaign.id == email.campaign_id))
    campaign = campaign_result.scalar_one_or_none()
    if campaign:
        campaign.emails_replied = (campaign.emails_replied or 0) + 1

    # 5. Classify sentiment via configured AI provider
    sentiment = "unknown"
    confidence = 0.0
    try:
        from app.ai.factory import get_provider
        from app.ai.safe_generate import safe_generate
        from app.ai.schemas import SentimentOutput

        provider = get_provider("sentiment")
        result_obj = await safe_generate(
            provider=provider,
            system_prompt=(
                "You are an email reply sentiment classifier. "
                "Classify the reply into one of: interested, not_interested, "
                "out_of_office, unsubscribe, question."
            ),
            user_prompt=f"Classify this reply:\n\n{body.reply_text[:2000]}",
            output_schema=SentimentOutput,
        )
        sentiment = result_obj.sentiment
        confidence = result_obj.confidence
    except Exception as exc:
        logger.warning("Sentiment classification failed: %s", exc)

    # 6. Persist reply record
    reply = Reply(
        email_id=email.id,
        from_email=lead.email if lead else "demo@example.com",
        subject=f"Re: {email.subject or 'Your outreach'}",
        body=body.reply_text[:5000],
        sentiment=sentiment,
        confidence=confidence,
        received_at=datetime.now(timezone.utc),
    )
    db.add(reply)
    await db.commit()
    await db.refresh(reply)

    return InjectReplyResponse(
        reply_id=str(reply.id),
        sentiment=sentiment,
        confidence=confidence,
        message=f"Reply injected. Sentiment: {sentiment} ({confidence:.0%} confidence).",
    )
