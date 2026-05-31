import email
import imaplib
import logging
import uuid
from datetime import datetime, timezone
from email.header import decode_header

from app.workers.celery_app import celery_app
from app.database import async_session
from app.config import settings
from app.models.campaign import Campaign
from app.models.generated_email import GeneratedEmail
from app.models.lead import Lead
from app.models.reply import Reply
from app.workers.send_tasks import cancel_remaining_sequence
from app.ai.factory import get_provider
from app.ai.safe_generate import safe_generate
from app.ai.schemas import SentimentOutput

from sqlalchemy import select

logger = logging.getLogger(__name__)


@celery_app.task
def check_for_replies():
    """
    Celery Beat task: runs every 5 minutes.
    Connects to IMAP, checks for new emails that are replies to campaign emails.
    """
    if not settings.IMAP_HOST or not settings.IMAP_EMAIL:
        return  # IMAP not configured — feature disabled

    import asyncio
    asyncio.run(_check_replies_async())


async def _check_replies_async():
    try:
        # Connect to IMAP
        mail = imaplib.IMAP4_SSL(settings.IMAP_HOST)
        mail.login(settings.IMAP_EMAIL, settings.IMAP_PASSWORD)
        mail.select("INBOX")

        # Search for unseen emails
        status, messages = mail.search(None, "UNSEEN")
        if status != "OK":
            logger.warning("Failed to search IMAP inbox")
            return

        email_ids = messages[0].split()
        if not email_ids:
            return

        logger.info(f"Found {len(email_ids)} unread emails to check for replies")

        for mail_id in email_ids:
            try:
                status, msg_data = mail.fetch(mail_id, "(RFC822)")
                if status != "OK":
                    continue

                raw_email = msg_data[0][1]
                msg = email.message_from_bytes(raw_email)

                await _process_reply(msg)

            except Exception as e:
                logger.error(f"Error processing email {mail_id}: {e}")
                continue

        mail.logout()

    except Exception as e:
        logger.error(f"IMAP connection error: {e}")


async def _process_reply(msg):
    """Process a single email to check if it's a reply to a campaign email."""

    # Extract In-Reply-To header for matching
    in_reply_to = msg.get("In-Reply-To", "")
    from_email = msg.get("From", "")
    subject = _decode_header(msg.get("Subject", ""))

    # Extract body
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            if content_type == "text/plain":
                body = part.get_payload(decode=True).decode("utf-8", errors="replace")
                break
    else:
        body = msg.get_payload(decode=True).decode("utf-8", errors="replace")

    async with async_session() as db:
        # Try to match by In-Reply-To header or sender address
        matched_email = None

        if in_reply_to:
            # Extract UUID from In-Reply-To and do a direct indexed lookup
            import re as _re
            uuid_match = _re.search(
                r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
                in_reply_to,
                _re.IGNORECASE,
            )
            if uuid_match:
                try:
                    candidate_id = uuid.UUID(uuid_match.group())
                    result = await db.execute(
                        select(GeneratedEmail).where(
                            GeneratedEmail.id == candidate_id,
                            GeneratedEmail.status == "sent",
                        )
                    )
                    matched_email = result.scalar_one_or_none()
                except ValueError:
                    pass

        if not matched_email:
            # Fallback: match by recipient email address (indexed O(1) lookup)
            reply_from_address = from_email.split("<")[-1].rstrip(">").strip() if "<" in from_email else from_email.strip()
            result = await db.execute(
                select(GeneratedEmail).where(
                    GeneratedEmail.recipient_email == reply_from_address,
                    GeneratedEmail.status == "sent",
                ).limit(1)
            )
            matched_email = result.scalar_one_or_none()

        if not matched_email:
            return  # Not a reply to any campaign email

        # ── Handle Reply ──
        logger.info(f"Reply detected for email {matched_email.id} from {from_email}")

        # 1. Update email status
        matched_email.status = "replied"
        matched_email.replied_at = datetime.now(timezone.utc)

        # 2. Update lead status
        lead_result = await db.execute(
            select(Lead).where(Lead.id == matched_email.lead_id)
        )
        lead = lead_result.scalar_one_or_none()
        if lead:
            lead.status = "replied"

        # 3. Cancel remaining sequence
        await cancel_remaining_sequence(db, matched_email.lead_id, matched_email.campaign_id)

        # 4. Update campaign stats
        campaign_result = await db.execute(
            select(Campaign).where(Campaign.id == matched_email.campaign_id)
        )
        campaign = campaign_result.scalar_one_or_none()
        if campaign:
            campaign.emails_replied += 1

        # 5. Classify sentiment via AI
        sentiment = "unknown"
        confidence = 0.0
        try:
            sentiment_provider = get_provider("sentiment")
            sentiment_result = await safe_generate(
                provider=sentiment_provider,
                system_prompt=(
                    "You are an email reply sentiment classifier. "
                    "Classify the reply into one of the allowed categories."
                ),
                user_prompt=f"Classify the sentiment of this email reply:\n\n{body[:2000]}",
                output_schema=SentimentOutput,
            )
            sentiment = sentiment_result.sentiment
            confidence = sentiment_result.confidence
        except Exception as _e:
            logger.warning(f"Sentiment classification failed: {_e}")

        # 6. Store reply
        reply = Reply(
            email_id=matched_email.id,
            from_email=from_email,
            subject=subject,
            body=body[:5000],  # truncate very long bodies
            sentiment=sentiment,
            confidence=confidence,
            received_at=datetime.now(timezone.utc),
        )
        db.add(reply)

        await db.commit()


def _decode_header(header_value: str) -> str:
    """Decode email header value to string."""
    decoded_parts = decode_header(header_value)
    result = ""
    for part, charset in decoded_parts:
        if isinstance(part, bytes):
            result += part.decode(charset or "utf-8", errors="replace")
        else:
            result += part
    return result


# Register beat schedule
celery_app.conf.beat_schedule["check-for-replies"] = {
    "task": "app.workers.reply_tasks.check_for_replies",
    "schedule": 300.0,  # every 5 minutes
}
