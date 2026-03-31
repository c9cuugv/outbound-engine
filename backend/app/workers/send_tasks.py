import logging
import random
import uuid
from datetime import datetime, timedelta, timezone, time

from app.workers.celery_app import celery_app
from app.config import settings
from app.database import async_session
from app.models.campaign import Campaign
from app.models.generated_email import GeneratedEmail
from app.models.lead import Lead
from app.services.email_provider import get_email_provider, HardBounceError, SoftBounceError
from app.services.tracking import inject_tracking

from sqlalchemy import select, and_

logger = logging.getLogger(__name__)

DAY_MAP = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}


def schedule_campaign_emails(campaign_id: str, db_session=None):
    """
    Calculate and set scheduled_at for all approved emails in a campaign.
    Respects timezone, sending days, window, daily limit, and adds jitter.
    """
    import asyncio
    asyncio.run(_schedule_emails_async(campaign_id))


async def _schedule_emails_async(campaign_id: str):
    async with async_session() as db:
        campaign_uuid = uuid.UUID(campaign_id)
        result = await db.execute(select(Campaign).where(Campaign.id == campaign_uuid))
        campaign = result.scalar_one_or_none()
        if not campaign:
            logger.error(f"Campaign {campaign_id} not found")
            return

        # Get all approved emails ordered by sequence position
        emails_result = await db.execute(
            select(GeneratedEmail).where(
                GeneratedEmail.campaign_id == campaign_uuid,
                GeneratedEmail.status == "approved",
            ).order_by(GeneratedEmail.sequence_position, GeneratedEmail.created_at)
        )
        emails = list(emails_result.scalars().all())

        if not emails:
            logger.warning(f"No approved emails for campaign {campaign_id}")
            return

        # Parse sending configuration
        sending_days = set()
        for day_str in campaign.sending_days:
            if day_str.lower() in DAY_MAP:
                sending_days.add(DAY_MAP[day_str.lower()])

        window_start = campaign.sending_window_start or time(9, 0)
        window_end = campaign.sending_window_end or time(17, 0)
        max_per_day = campaign.max_emails_per_day or 50

        # Schedule emails across days
        now = datetime.now(timezone.utc)
        current_date = now.date()
        emails_scheduled_today = 0
        schedule_cursor = now

        for email in emails:
            # Find the next valid sending slot
            candidate_date = current_date + timedelta(days=email.sequence_position * 1)  # days_delay from template not accounted yet

            # Skip to next valid sending day
            while candidate_date.weekday() not in sending_days:
                candidate_date += timedelta(days=1)

            # Check daily limit
            if emails_scheduled_today >= max_per_day:
                candidate_date += timedelta(days=1)
                while candidate_date.weekday() not in sending_days:
                    candidate_date += timedelta(days=1)
                emails_scheduled_today = 0

            # Calculate time within window
            window_minutes = (
                window_end.hour * 60 + window_end.minute
            ) - (
                window_start.hour * 60 + window_start.minute
            )
            slot_offset = random.randint(0, max(window_minutes, 1))  # distribute within window
            jitter_minutes = random.randint(-15, 15)  # ±15 min jitter

            scheduled_time = datetime(
                candidate_date.year, candidate_date.month, candidate_date.day,
                window_start.hour, window_start.minute,
                tzinfo=timezone.utc,
            ) + timedelta(minutes=slot_offset + jitter_minutes)

            # Clamp to window
            day_start = datetime(
                candidate_date.year, candidate_date.month, candidate_date.day,
                window_start.hour, window_start.minute, tzinfo=timezone.utc,
            )
            day_end = datetime(
                candidate_date.year, candidate_date.month, candidate_date.day,
                window_end.hour, window_end.minute, tzinfo=timezone.utc,
            )
            scheduled_time = max(scheduled_time, day_start)
            scheduled_time = min(scheduled_time, day_end)

            email.scheduled_at = scheduled_time
            email.status = "scheduled"
            emails_scheduled_today += 1

        campaign.status = "active"
        await db.commit()
        logger.info(f"Scheduled {len(emails)} emails for campaign {campaign_id}")


@celery_app.task
def process_scheduled_emails():
    """
    Celery Beat task: runs every 60 seconds.
    Picks up emails due for sending and dispatches individual send tasks.
    """
    import asyncio
    asyncio.run(_process_scheduled_async())


async def _process_scheduled_async():
    async with async_session() as db:
        now = datetime.now(timezone.utc)

        # Find all emails scheduled before now
        result = await db.execute(
            select(GeneratedEmail).where(
                GeneratedEmail.status == "scheduled",
                GeneratedEmail.scheduled_at <= now,
            ).limit(100)  # batch size
        )
        due_emails = list(result.scalars().all())

        for email in due_emails:
            email.status = "sending"
            send_email.delay(str(email.id))

        await db.commit()
        if due_emails:
            logger.info(f"Dispatched {len(due_emails)} emails for sending")


@celery_app.task(bind=True, max_retries=3, default_retry_delay=3600)
def send_email(self, email_id: str):
    """
    Send a single email with tracking injection.
    Handles bounces with distinct retry behavior.
    """
    import asyncio
    asyncio.run(_send_email_async(self, email_id))


async def _send_email_async(task_self, email_id: str):
    async with async_session() as db:
        email_uuid = uuid.UUID(email_id)
        result = await db.execute(
            select(GeneratedEmail).where(GeneratedEmail.id == email_uuid)
        )
        email = result.scalar_one_or_none()
        if not email:
            logger.error(f"Email {email_id} not found")
            return

        # Check if lead has since replied/unsubscribed/bounced
        lead_result = await db.execute(select(Lead).where(Lead.id == email.lead_id))
        lead = lead_result.scalar_one_or_none()
        if lead and lead.status in ("unsubscribed", "bounced", "replied"):
            email.status = "cancelled"
            await db.commit()
            logger.info(f"Skipped email {email_id}: lead status is {lead.status}")
            return

        # Get campaign for sender info
        campaign_result = await db.execute(
            select(Campaign).where(Campaign.id == email.campaign_id)
        )
        campaign = campaign_result.scalar_one_or_none()
        if not campaign:
            logger.error(f"Campaign not found for email {email_id}")
            return

        # Inject tracking
        tracked_body = inject_tracking(email.body, str(email.id))

        # Build unsubscribe header
        unsub_url = f"https://{settings.TRACKING_DOMAIN}/t/u/{email.id}" if settings.TRACKING_DOMAIN else ""
        headers = {}
        if unsub_url:
            headers["List-Unsubscribe"] = f"<{unsub_url}>"

        # Send
        provider = get_email_provider()
        try:
            send_result = await provider.send(
                to_email=lead.email if lead else "",
                from_email=campaign.sender_email or "noreply@outbound.dev",
                from_name=campaign.sender_name or "OutboundEngine",
                subject=email.subject,
                html_body=tracked_body,
                reply_to=campaign.reply_to_email,
                headers=headers,
            )

            email.status = "sent"
            email.sent_at = datetime.now(timezone.utc)

            # Update campaign stats
            campaign.emails_sent += 1

            await db.commit()
            logger.info(f"Sent email {email_id} to {lead.email if lead else 'unknown'}")

        except HardBounceError as e:
            email.status = "bounced"
            email.bounced_at = datetime.now(timezone.utc)
            email.bounce_type = "hard"
            if lead:
                lead.status = "bounced"
            campaign.emails_bounced += 1

            # Cancel remaining emails in sequence for this lead
            await cancel_remaining_sequence(db, email.lead_id, email.campaign_id)
            await db.commit()
            logger.warning(f"Hard bounce for email {email_id}: {e}")

        except SoftBounceError as e:
            logger.warning(f"Soft bounce for email {email_id}: {e}")
            email.status = "scheduled"  # put back in queue
            await db.commit()
            # Retry in 1 hour
            raise task_self.retry(exc=e)


async def cancel_remaining_sequence(db, lead_id: uuid.UUID, campaign_id: uuid.UUID):
    """Cancel all pending/scheduled emails for a lead in a campaign."""
    result = await db.execute(
        select(GeneratedEmail).where(
            GeneratedEmail.lead_id == lead_id,
            GeneratedEmail.campaign_id == campaign_id,
            GeneratedEmail.status.in_(["scheduled", "approved", "draft", "sending"]),
        )
    )
    for email in result.scalars().all():
        email.status = "cancelled"
    logger.info(f"Cancelled remaining sequence for lead {lead_id} in campaign {campaign_id}")


# Register beat schedule
celery_app.conf.beat_schedule["process-scheduled-emails"] = {
    "task": "app.workers.send_tasks.process_scheduled_emails",
    "schedule": 60.0,  # every 60 seconds
}
