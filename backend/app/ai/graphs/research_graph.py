import asyncio
from typing import TypedDict, Any
import logging
from bs4 import BeautifulSoup
import httpx
from datetime import datetime, timezone
import uuid

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.runnables import RunnableConfig

from app.ai.schemas import ResearchOutput
from app.ai.safe_generate import safe_generate
from app.ai.factory import get_provider
from app.ai.prompts.research import RESEARCH_SYSTEM_PROMPT, build_research_prompt
from app.models.lead import Lead
from sqlalchemy import select

logger = logging.getLogger(__name__)

class ResearchState(TypedDict):
    lead_id: str
    website_url: str
    scraped_pages: list[dict]
    signals: dict
    research_output: ResearchOutput | None
    error: str | None
    attempt: int
    status: str

async def scrape_pages(state: ResearchState, config: RunnableConfig) -> dict:
    """Scrape up to 7 URLs using httpx. Store results in scraped_pages."""
    base_url = state["website_url"]
    if not base_url:
        return {"scraped_pages": [], "status": "failed", "error": "No URL provided"}
        
    if not base_url.startswith("http"):
        base_url = f"https://{base_url}"
        
    paths = ["/", "/about", "/careers", "/pricing", "/blog", "/team", "/contact"]
    scraped_pages = []
    
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        tasks = []
        for path in paths:
            url = f"{base_url.rstrip('/')}{path}"
            tasks.append(client.get(url))
            
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for path, result in zip(paths, results):
            url = f"{base_url.rstrip('/')}{path}"
            if isinstance(result, Exception):
                scraped_pages.append({"url": url, "content": "", "status_code": 0})
            else:
                scraped_pages.append({"url": url, "content": result.text, "status_code": result.status_code})
                
    return {"scraped_pages": scraped_pages, "status": "scraping"}

async def extract_signals(state: ResearchState, config: RunnableConfig) -> dict:
    """Parse HTML with BeautifulSoup to detect tech stack and hiring signals."""
    tech_stack = []
    hiring_signals = []
    
    for page in state.get("scraped_pages", []):
        if not page.get("content"):
            continue
            
        soup = BeautifulSoup(page["content"], "html.parser")
        
        for a in soup.find_all("a", href=True):
            href = a["href"].lower()
            if "greenhouse.io" in href and "Greenhouse" not in hiring_signals:
                hiring_signals.append("Greenhouse")
            if "lever.co" in href and "Lever" not in hiring_signals:
                hiring_signals.append("Lever")
                    
        for meta in soup.find_all("meta", attrs={"name": "generator"}):
            content = meta.get("content")
            if content and content not in tech_stack:
                tech_stack.append(content)
                
        for script in soup.find_all("script", src=True):
            src = script["src"].lower()
            if "react" in src and "React" not in tech_stack: tech_stack.append("React")
            if "vue" in src and "Vue" not in tech_stack: tech_stack.append("Vue")
            if "next" in src and "Next.js" not in tech_stack: tech_stack.append("Next.js")
            if "stripe.com" in src and "Stripe" not in tech_stack: tech_stack.append("Stripe")
            
    signals = {
        "tech_stack": list(set(tech_stack)),
        "hiring_signals": {
            "is_hiring": len(hiring_signals) > 0,
            "boards": {board: True for board in set(hiring_signals)}
        },
        "page_count": len([p for p in state.get("scraped_pages", []) if p.get("status_code") == 200])
    }
    
    return {"signals": signals, "status": "analyzing"}

def check_scrape_quality(state: ResearchState) -> str:
    """Conditional check on scrape quality."""
    if state.get("error"):
        return "mark_failed"
    total_content = sum(len(p.get("content", "")) for p in state.get("scraped_pages", []))
    if total_content < 500:
        return "mark_failed"
    return "synthesize"

async def synthesize(state: ResearchState, config: RunnableConfig) -> dict:
    """Synthesize research data with LLM using safe_generate."""
    db_session = config["configurable"]["db_session_factory"]
    
    async with db_session() as db:
        result = await db.execute(select(Lead).where(Lead.id == uuid.UUID(state["lead_id"])))
        lead = result.scalar_one_or_none()
        if not lead:
            return {"error": "Lead not found", "status": "failed"}
            
        lead_dict = {
            "first_name": lead.first_name,
            "last_name": lead.last_name,
            "title": lead.title,
            "company_name": lead.company_name,
            "company_domain": lead.company_domain,
        }
        
    scraped_data = {}
    for p in state.get("scraped_pages", []):
        if p.get("status_code") == 200:
            soup = BeautifulSoup(p["content"], "html.parser")
            scraped_data[p["url"]] = soup.get_text(separator=" ", strip=True)[:2000]
            
    prompt = build_research_prompt(lead_dict, scraped_data, state.get("signals", {}))
    
    try:
        provider = get_provider("research")
        research_output = await safe_generate(
            provider=provider,
            system_prompt=RESEARCH_SYSTEM_PROMPT,
            user_prompt=prompt,
            output_schema=ResearchOutput,
        )
        return {"research_output": research_output, "status": "completed"}
    except Exception as e:
        logger.error(f"Synthesis failed: {e}")
        return {"error": str(e), "status": "failed"}

async def save_result(state: ResearchState, config: RunnableConfig) -> dict:
    """Save output to lead enrichment column."""
    if not state.get("research_output"):
        return {"status": "failed"}
        
    out = state["research_output"]
    research_dict = out.model_dump()
    confidence = research_dict.get("confidence_score", 0.0)
    final_status = "needs_review" if confidence < 0.6 else "completed"
    
    db_session = config["configurable"]["db_session_factory"]
    async with db_session() as db:
        result = await db.execute(select(Lead).where(Lead.id == uuid.UUID(state["lead_id"])))
        lead = result.scalar_one_or_none()
        if lead:
            lead.company_description = research_dict.get("company_summary")
            lead.company_industry = research_dict.get("industry")
            lead.company_size = research_dict.get("company_size_estimate")
            lead.company_tech_stack = research_dict.get("tech_stack_signals")
            lead.pain_points = research_dict.get("potential_pain_points")
            lead.research_status = final_status
            lead.research_completed_at = datetime.now(timezone.utc)
            await db.commit()
            
    return {"status": final_status}

async def mark_failed(state: ResearchState, config: RunnableConfig) -> dict:
    """Mark lead research status as failed."""
    db_session = config["configurable"]["db_session_factory"]
    async with db_session() as db:
        result = await db.execute(select(Lead).where(Lead.id == uuid.UUID(state["lead_id"])))
        lead = result.scalar_one_or_none()
        if lead:
            lead.research_status = "failed"
            await db.commit()
    logger.warning(f"Research failed for {state['lead_id']}: {state.get('error')}")
    return {"status": "failed"}

def route_synthesize_result(state: ResearchState) -> str:
    if state.get("status") == "failed":
        return "mark_failed"
    return "save_result"

def build_research_graph() -> StateGraph:
    workflow = StateGraph(ResearchState)
    
    workflow.add_node("scrape_pages", scrape_pages)
    workflow.add_node("extract_signals", extract_signals)
    workflow.add_node("synthesize", synthesize)
    workflow.add_node("save_result", save_result)
    workflow.add_node("mark_failed", mark_failed)
    
    workflow.add_edge(START, "scrape_pages")
    workflow.add_edge("scrape_pages", "extract_signals")
    workflow.add_conditional_edges("extract_signals", check_scrape_quality)
    workflow.add_conditional_edges("synthesize", route_synthesize_result)
    workflow.add_edge("save_result", END)
    workflow.add_edge("mark_failed", END)
    
    # TODO: Use PostgresSaver in production
    memory = MemorySaver()
    return workflow.compile(checkpointer=memory)
