import uuid
import logging
from io import BytesIO

from fastapi import APIRouter, Request
from fastapi.responses import Response, RedirectResponse, HTMLResponse
from sqlalchemy import select, update

from app.database import async_session
from app.models.generated_email import GeneratedEmail
from app.models.lead import Lead
from app.models.tracking_event import TrackingEvent
from app.services.tracking import get_original_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/t", tags=["tracking"])

# 1×1 transparent PNG (68 bytes)
TRANSPARENT_PIXEL = bytes([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02,
    0x00, 0x01, 0xe2, 0x21, 0xbc, 0x33, 0x00, 0x00,
    0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
    0x60, 0x82,
])


@router.get("/o/{email_id}.png")
async def track_open(email_id: str, request: Request):
    """Tracking pixel — records email open event."""
    try:
        async with async_session() as db:
            email_uuid = uuid.UUID(email_id)

            # Record event
            event = TrackingEvent(
                email_id=email_uuid,
                event_type="opened",
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
            )
            db.add(event)

            # Update email: first open sets timestamp, all increment count
            email_result = await db.execute(
                select(GeneratedEmail).where(GeneratedEmail.id == email_uuid)
            )
            email = email_result.scalar_one_or_none()
            if email:
                if email.opened_at is None:
                    from datetime import datetime, timezone
                    email.opened_at = datetime.now(timezone.utc)
                email.opened_count += 1

            await db.commit()
    except Exception as e:
        logger.error(f"Track open error: {e}")

    return Response(content=TRANSPARENT_PIXEL, media_type="image/png")


@router.get("/c/{email_id}/{link_hash}")
async def track_click(email_id: str, link_hash: str, request: Request):
    """Click tracking — redirects to original URL."""
    original_url = get_original_url(link_hash)
    if not original_url:
        return HTMLResponse("<h1>Link expired or not found</h1>", status_code=404)

    try:
        async with async_session() as db:
            email_uuid = uuid.UUID(email_id)

            event = TrackingEvent(
                email_id=email_uuid,
                event_type="clicked",
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
                link_url=original_url,
            )
            db.add(event)

            email_result = await db.execute(
                select(GeneratedEmail).where(GeneratedEmail.id == email_uuid)
            )
            email = email_result.scalar_one_or_none()
            if email:
                if email.clicked_at is None:
                    from datetime import datetime, timezone
                    email.clicked_at = datetime.now(timezone.utc)
                email.clicked_count += 1

            await db.commit()
    except Exception as e:
        logger.error(f"Track click error: {e}")

    return RedirectResponse(url=original_url, status_code=302)


@router.get("/u/{email_id}")
async def track_unsubscribe(email_id: str, request: Request):
    """Unsubscribe handler — updates lead status and cancels pending emails."""
    try:
        async with async_session() as db:
            email_uuid = uuid.UUID(email_id)

            # Record event
            event = TrackingEvent(
                email_id=email_uuid,
                event_type="unsubscribed",
                ip_address=request.client.host if request.client else None,
            )
            db.add(event)

            # Get the email and its lead
            email_result = await db.execute(
                select(GeneratedEmail).where(GeneratedEmail.id == email_uuid)
            )
            email = email_result.scalar_one_or_none()

            if email:
                # Update lead status
                lead_result = await db.execute(
                    select(Lead).where(Lead.id == email.lead_id)
                )
                lead = lead_result.scalar_one_or_none()
                if lead:
                    lead.status = "unsubscribed"

                # Cancel remaining scheduled/approved emails for this lead in this campaign
                remaining = await db.execute(
                    select(GeneratedEmail).where(
                        GeneratedEmail.lead_id == email.lead_id,
                        GeneratedEmail.campaign_id == email.campaign_id,
                        GeneratedEmail.status.in_(["scheduled", "approved", "draft"]),
                    )
                )
                for pending_email in remaining.scalars().all():
                    pending_email.status = "cancelled"

            await db.commit()
    except Exception as e:
        logger.error(f"Unsubscribe error: {e}")

    return HTMLResponse(
        "<html><body><h2>You have been unsubscribed</h2>"
        "<p>You will no longer receive emails from this campaign.</p></body></html>"
    )
