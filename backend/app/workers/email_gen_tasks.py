import logging
import uuid

from app.workers.celery_app import celery_app
from app.database import async_session
from app.models.campaign import Campaign
from app.models.generated_email import GeneratedEmail
from app.models.lead import Lead
from app.models.template import EmailTemplate

from app.ai.factory import get_provider
from app.ai.safe_generate import safe_generate
from app.ai.schemas import EmailOutput
from app.ai.prompts.email_gen import build_system_prompt, build_email_prompt

from sqlalchemy import select, update

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, rate_limit="15/m")
def generate_campaign_emails(self, campaign_id: str):
    """Generate personalized emails for all eligible leads in a campaign.

    Pipeline: set status → fetch leads/templates → AI generate per lead×template → store drafts → set review.
    """
    import asyncio
    asyncio.run(_generate_emails_async(campaign_id))


async def _generate_emails_async(campaign_id: str):
    """Async implementation of email generation."""
    async with async_session() as db:
        # 1. Update status to 'generating'
        campaign_uuid = uuid.UUID(campaign_id)
        result = await db.execute(select(Campaign).where(Campaign.id == campaign_uuid))
        campaign = result.scalar_one_or_none()
        if not campaign:
            logger.error(f"Campaign {campaign_id} not found")
            return

        campaign.status = "generating"
        await db.commit()

        # 2. Get templates (ordered by sequence_position)
        templates_result = await db.execute(
            select(EmailTemplate).order_by(EmailTemplate.sequence_position)
        )
        templates = list(templates_result.scalars().all())

        if not templates:
            logger.warning(f"No templates found for campaign {campaign_id}")
            campaign.status = "review"
            await db.commit()
            return

        # 3. Get all eligible leads (research completed)
        leads_result = await db.execute(
            select(Lead).where(Lead.research_status == "completed")
        )
        leads = list(leads_result.scalars().all())

        generated_count = 0
        error_count = 0

        # Get AI provider for email generation
        provider = get_provider("email_gen")

        # Pre-build campaign base dict and per-template system prompts (invariant across leads)
        campaign_base = {
            "product_name": campaign.product_name,
            "product_description": campaign.product_description,
            "icp_description": campaign.icp_description,
            "value_prop": campaign.value_prop,
        }
        template_prompts = {}
        for template in templates:
            campaign_dict = {
                **campaign_base,
                "max_word_count": template.max_word_count if hasattr(template, "max_word_count") else 120,
            }
            template_prompts[template.id] = {
                "system_prompt": build_system_prompt(campaign_dict),
                "template_dict": {"sequence_position": template.sequence_position, "name": template.name},
            }

        # 4. Generate emails: each lead × each template
        for lead in leads:
            previous_context = None
            lead_dict = {
                "first_name": lead.first_name,
                "last_name": lead.last_name,
                "title": lead.title,
                "company_name": lead.company_name,
            }
            research_data = lead.research_data if hasattr(lead, "research_data") and lead.research_data else {}

            for template in templates:
                try:
                    tp = template_prompts[template.id]
                    user_prompt = build_email_prompt(
                        tp["template_dict"], lead_dict, research_data, previous_context
                    )
                    result = await safe_generate(
                        provider=provider,
                        system_prompt=tp["system_prompt"],
                        user_prompt=user_prompt,
                        output_schema=EmailOutput,
                    )

                    subject = result.subject_options[0]
                    subject_alternatives = result.subject_options[1:] if len(result.subject_options) > 1 else []
                    body = result.body

                    email = GeneratedEmail(
                        lead_id=lead.id,
                        campaign_id=campaign.id,
                        template_id=template.id,
                        sequence_position=template.sequence_position,
                        subject=subject,
                        subject_alternatives=subject_alternatives,
                        body=body,
                        body_original=body,
                        status="draft",
                    )
                    db.add(email)
                    generated_count += 1

                    # Context for next step in sequence
                    previous_context = {
                        "previous_subject": subject,
                        "previous_body_summary": body[:200],
                    }

                except Exception as e:
                    error_count += 1
                    logger.error(
                        f"Failed to generate email for lead {lead.id}, "
                        f"template {template.id}: {e}"
                    )
                    continue

        # 5. Update campaign stats and status
        campaign.total_leads = len(leads)
        campaign.status = "review"
        await db.commit()

        logger.info(
            f"Campaign {campaign_id}: generated {generated_count} emails, "
            f"{error_count} errors, {len(leads)} leads"
        )
