"""
Research Worker (STORY-4.4)

Celery tasks that run the full research pipeline:
  scrape → signals → AI synthesis → store on lead

Two tasks:
  - research_lead(lead_id)       — researches a single lead
  - research_lead_list(lead_list_id) — dispatches individual tasks per lead
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from app.workers.celery_app import celery_app
from app.database import async_session
from app.models.lead import Lead, LeadListMember
from app.ai.exceptions import GenerationError
from app.ai.factory import get_provider
from app.ai.prompts.research import RESEARCH_SYSTEM_PROMPT, build_research_prompt
from app.ai.safe_generate import safe_generate
from app.ai.schemas import ResearchOutput
from app.services.scraper import CompanyScraper
from app.services.signals import SignalCollector

logger = logging.getLogger(__name__)

# Shared service instances
_scraper = CompanyScraper()
_signal_collector = SignalCollector()

# Confidence threshold — below this, research needs human review
_CONFIDENCE_THRESHOLD = 0.6


@celery_app.task(
    bind=True,
    max_retries=3,
    rate_limit="10/m",
    acks_late=True,
    default_retry_delay=60,
)
def research_lead(self, lead_id: str) -> dict[str, Any]:
    """Research a single lead: scrape + signals (parallel) → AI synthesis → store."""
    try:
        return asyncio.run(_research_lead_async(lead_id))
    except Exception as exc:
        retry_countdown = 60 * (self.request.retries + 1)
        logger.error(
            "Research failed for lead %s (attempt %d), retrying in %ds: %s",
            lead_id, self.request.retries + 1, retry_countdown, exc,
        )
        raise self.retry(exc=exc, countdown=retry_countdown)


async def _research_lead_async(lead_id: str) -> dict[str, Any]:
    """Async implementation of the research pipeline."""
    lead_uuid = uuid.UUID(lead_id)

    async with async_session() as db:
        # Step 1: Get lead and set status to in_progress
        result = await db.execute(select(Lead).where(Lead.id == lead_uuid))
        lead = result.scalar_one_or_none()
        if not lead:
            logger.error("Lead %s not found", lead_id)
            return {"status": "failed", "reason": "not_found"}

        lead.research_status = "in_progress"
        await db.commit()

        logger.info("Starting research for lead %s (%s)", lead_id, lead.company_domain)

        domain = lead.company_domain
        if not domain:
            lead.research_status = "failed"
            await db.commit()
            return {"status": "failed", "reason": "no_domain"}

        # Step 2: Scrape + collect signals in parallel
        scraped_data, signals = await asyncio.gather(
            _scraper.scrape_company(domain),
            _signal_collector.collect_all(domain),
        )

        # Step 3: If empty scrape, fail without calling LLM
        if not scraped_data:
            lead.research_status = "failed"
            await db.commit()
            logger.warning("Empty scrape for %s — skipping LLM call", domain)
            return {"status": "failed", "reason": "empty_scrape"}

        # Step 4: Build research prompt
        lead_dict = {
            "first_name": lead.first_name,
            "last_name": lead.last_name,
            "title": lead.title,
            "company_name": lead.company_name,
            "company_domain": lead.company_domain,
        }
        prompt = build_research_prompt(lead_dict, scraped_data, signals)

        # Step 5: Call safe_generate
        try:
            provider = get_provider("research")
            research_output: ResearchOutput = await safe_generate(
                provider=provider,
                system_prompt=RESEARCH_SYSTEM_PROMPT,
                user_prompt=prompt,
                output_schema=ResearchOutput,
            )
        except GenerationError as e:
            lead.research_status = "failed"
            await db.commit()
            logger.error("LLM generation failed for lead %s: %s", lead_id, e)
            return {"status": "failed", "reason": "generation_error"}

        # Step 6: Determine final status based on confidence
        research_dict = research_output.model_dump()
        confidence = research_dict.get("confidence_score", 0.0)

        if confidence < _CONFIDENCE_THRESHOLD:
            final_status = "needs_review"
            logger.info("Low confidence (%.2f) for lead %s — marking needs_review", confidence, lead_id)
        else:
            final_status = "completed"
            logger.info("Research completed for lead %s (confidence: %.2f)", lead_id, confidence)

        # Step 7: Store research on lead record
        lead.company_description = research_dict.get("company_summary")
        lead.company_industry = research_dict.get("industry")
        lead.company_size = research_dict.get("company_size_estimate")
        lead.company_tech_stack = research_dict.get("tech_stack_signals")
        lead.pain_points = research_dict.get("potential_pain_points")
        lead.research_status = final_status
        lead.research_completed_at = datetime.now(timezone.utc)
        await db.commit()

        return {
            "status": final_status,
            "confidence": confidence,
            "industry": research_dict.get("industry"),
        }


@celery_app.task(rate_limit="5/m")
def research_lead_list(lead_list_id: str) -> dict[str, int]:
    """Dispatch individual research tasks for each pending lead in a list."""
    return asyncio.run(_research_lead_list_async(lead_list_id))


async def _research_lead_list_async(lead_list_id: str) -> dict[str, int]:
    list_uuid = uuid.UUID(lead_list_id)

    async with async_session() as db:
        result = await db.execute(
            select(Lead)
            .join(LeadListMember, Lead.id == LeadListMember.lead_id)
            .where(
                LeadListMember.lead_list_id == list_uuid,
                Lead.research_status == "pending",
            )
        )
        leads = list(result.scalars().all())

    dispatched = 0
    for lead in leads:
        research_lead.delay(str(lead.id))
        dispatched += 1

    logger.info("Dispatched %d research tasks for lead list %s", dispatched, lead_list_id)
    return {"dispatched": dispatched, "total_leads": len(leads)}
