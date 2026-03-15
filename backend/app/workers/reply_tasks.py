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
        # Try to match by In-Reply-To header or subject
        matched_email = None

        if in_reply_to:
            # Check if in_reply_to contains a message-id we sent
            result = await db.execute(
                select(GeneratedEmail).where(
                    GeneratedEmail.status == "sent"
                )
            )
            for sent_email in result.scalars().all():
                if str(sent_email.id) in in_reply_to:
                    matched_email = sent_email
                    break

        if not matched_email and subject:
            # Fallback: match by subject (remove Re:/Fwd: and compare)
            clean_subject = subject.lower().replace("re:", "").replace("fwd:", "").strip()
            result = await db.execute(
                select(GeneratedEmail).where(
                    GeneratedEmail.status == "sent"
                )
            )
            for sent_email in result.scalars().all():
                if sent_email.subject and clean_subject in sent_email.subject.lower():
                    matched_email = sent_email
                    break

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

        # 5. Classify sentiment
        # TODO: Use Developer B's safe_generate + SentimentOutput for AI classification
        sentiment = "unknown"
        confidence = 0.0

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
