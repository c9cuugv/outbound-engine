import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.v1.auth import get_current_user
from app.models.user import User
from app.services.scraper import CompanyScraper
from app.ai.safe_generate import safe_generate
from app.ai.factory import get_provider
from app.ai.schemas import EmailOutput

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/quick-draft", tags=["quick-draft"])

class QuickDraftRequest(BaseModel):
    website_url: str
    product_name: str
    value_proposition: str
    prospect_name: str
    prospect_email: str

class QuickDraftResponse(BaseModel):
    subject: str
    body: str
    scraped_signals: dict[str, str]
    website_url: str


@router.post("", response_model=QuickDraftResponse)
async def quick_draft(
    request: QuickDraftRequest,
    current_user: User = Depends(get_current_user)
):
    # 1. Normalize website_url
    domain = request.website_url.replace("https://", "").replace("http://", "").split("/")[0]

    # 2. Scrape
    scraper = CompanyScraper()
    scrape_results = await scraper.scrape_company(domain)

    # 3. Check empty
    if not scrape_results:
        raise HTTPException(
            status_code=422, 
            detail="Could not scrape any content from that website. Check the URL and try again."
        )

    # 4. Build user_prompt
    scraped_content_joined = "\\n\\n".join([f"--- PAGE: {path} ---\\n{content}" for path, content in scrape_results.items()])
    
    user_prompt = f"""You are writing a cold outreach email on behalf of {request.product_name}.
    
PROSPECT: {request.prospect_name} at {domain}

WHAT WE KNOW ABOUT THEIR COMPANY (scraped from their website):
{scraped_content_joined}

YOUR PRODUCT: {request.product_name}
VALUE PROPOSITION: {request.value_proposition}

Write a short, personalized cold email (subject + body) that references specific things
from their website. Be concrete. Do not use generic phrases like "I noticed your company".
Reference actual signals from the scraped content."""

    system_prompt = """You are an expert B2B copywriter. Write concise, personalized cold emails that reference
specific facts about the prospect's company. Never fabricate statistics or claims not
present in the provided data. Keep emails under 150 words."""

    # 5. Safe generate
    provider = get_provider("email_gen")
    try:
        email_out = await safe_generate(
            provider=provider,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            output_schema=EmailOutput
        )
    except Exception as e:
        logger.error(f"Failed to generate quick draft: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate draft. Please try again.")

    # 6. Build response
    scraped_signals = {path: text[:200] for path, text in scrape_results.items()}
    
    return QuickDraftResponse(
        subject=email_out.subject_options[0] if email_out.subject_options else "Draft Subject",
        body=email_out.body,
        scraped_signals=scraped_signals,
        website_url=domain
    )
