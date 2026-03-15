"""
Seed script: Creates 3 default email templates for the OutboundEngine.

Usage:
    cd backend
    python -m scripts.seed_templates
"""
import asyncio
from app.database import async_session
from app.models.template import EmailTemplate
from sqlalchemy import select


SEED_TEMPLATES = [
    {
        "name": "Initial Outreach",
        "generation_prompt": (
            "Write a concise, personalized cold email introducing {product_name}. "
            "Reference specific details about the lead's company: {company_name}, "
            "their role as {title}, and a recent signal or pain point. "
            "Keep it under {max_word_count} words. End with a clear, low-friction CTA."
        ),
        "max_word_count": 120,
        "tone": "professional-casual",
        "sequence_position": 1,
        "days_delay": 0,
    },
    {
        "name": "Value Follow-up",
        "generation_prompt": (
            "Write a follow-up email to someone who didn't respond to the initial outreach. "
            "Lead with a specific piece of value: a relevant case study, industry stat, "
            "or insight about {company_name}'s industry ({company_industry}). "
            "Reference the previous email briefly. Keep under {max_word_count} words."
        ),
        "max_word_count": 100,
        "tone": "professional-casual",
        "sequence_position": 2,
        "days_delay": 3,
    },
    {
        "name": "Breakup Email",
        "generation_prompt": (
            "Write a brief, respectful final follow-up ('breakup') email. "
            "Acknowledge you haven't heard back. Offer one last clear value proposition. "
            "Make it easy to say 'no' or 'not now'. Keep under {max_word_count} words."
        ),
        "max_word_count": 80,
        "tone": "friendly-direct",
        "sequence_position": 3,
        "days_delay": 7,
    },
]


async def seed():
    async with async_session() as db:
        # Check if templates already exist
        result = await db.execute(select(EmailTemplate))
        existing = result.scalars().all()
        if existing:
            print(f"Templates already exist ({len(existing)} found). Skipping seed.")
            return

        for template_data in SEED_TEMPLATES:
            template = EmailTemplate(**template_data)
            db.add(template)

        await db.commit()
        print(f"Seeded {len(SEED_TEMPLATES)} email templates.")


if __name__ == "__main__":
    asyncio.run(seed())
