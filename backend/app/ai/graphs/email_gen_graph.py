import asyncio
from typing import TypedDict, Any
import logging
import uuid
from datetime import datetime, timezone

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.runnables import RunnableConfig

from app.ai.schemas import EmailOutput
from app.ai.safe_generate import safe_generate
from app.ai.factory import get_provider
from app.ai.prompts.email_gen import build_system_prompt, build_email_prompt
from app.models.campaign import Campaign
from app.models.lead import Lead
from app.models.template import EmailTemplate
from app.models.generated_email import GeneratedEmail
from sqlalchemy import select

logger = logging.getLogger(__name__)

class EmailGenState(TypedDict):
    campaign_id: str
    lead_id: str
    template_id: str
    research_data: dict
    campaign_context: dict
    template_prompt: str
    email_output: EmailOutput | None
    attempt: int
    error: str | None
    email_record_id: str | None
    lead_basic: dict

async def load_context(state: EmailGenState, config: RunnableConfig) -> dict:
    """Fetch lead enrichment, campaign context, and template prompt."""
    db_session = config["configurable"]["db_session_factory"]
    async with db_session() as db:
        lead = (await db.execute(select(Lead).where(Lead.id == uuid.UUID(state["lead_id"])))).scalar_one_or_none()
        campaign = (await db.execute(select(Campaign).where(Campaign.id == uuid.UUID(state["campaign_id"])))).scalar_one_or_none()
        template = (await db.execute(select(EmailTemplate).where(EmailTemplate.id == uuid.UUID(state["template_id"])))).scalar_one_or_none()
        
        if not lead or not campaign or not template:
            return {"error": "Missing DB records"}
            
        research_data = {
            "company_description": lead.company_description,
            "company_industry": lead.company_industry,
            "company_size": lead.company_size,
            "company_tech_stack": lead.company_tech_stack,
            "pain_points": lead.pain_points,
            "research_status": lead.research_status
        }
        
        campaign_context = {
            "product_name": campaign.product_name,
            "product_description": campaign.product_description,
            "icp_description": campaign.icp_description,
            "value_prop": campaign.value_prop,
            "max_word_count": template.max_word_count if hasattr(template, "max_word_count") else 120,
        }
        
        lead_basic = {
            "first_name": lead.first_name,
            "last_name": lead.last_name,
            "title": lead.title,
            "company_name": lead.company_name,
        }
        
        return {
            "research_data": research_data,
            "campaign_context": campaign_context,
            "template_prompt": template.generation_prompt if hasattr(template, "generation_prompt") else "",
            "lead_basic": lead_basic,
            "attempt": state.get("attempt", 0)
        }

def check_research_ready(state: EmailGenState) -> str:
    """Conditional: if research_data is empty or not completed, skip."""
    if state.get("error"):
        return "mark_failed"
        
    rd = state.get("research_data", {})
    if not rd or rd.get("research_status") != "completed":
        return "skip_generation"
    return "generate_email"

async def generate_email(state: EmailGenState, config: RunnableConfig) -> dict:
    """Call safe_generate. Inject research signals into prompt."""
    try:
        sys_prompt = build_system_prompt(state["campaign_context"])
        
        template_dict = {"generation_prompt": state["template_prompt"], "sequence_position": 1, "name": ""}
        
        prompt = build_email_prompt(template_dict, state["lead_basic"], state["research_data"], None)
        
        if state.get("error") and state.get("attempt", 0) > 0:
            prompt += f"\\n\\nPREVIOUS ERROR (fix this): {state.get('error')}"
            
        provider = get_provider("email_gen")
        email_out = await safe_generate(
            provider=provider,
            system_prompt=sys_prompt,
            user_prompt=prompt,
            output_schema=EmailOutput
        )
        return {"email_output": email_out, "attempt": state.get("attempt", 0) + 1, "error": None}
    except Exception as e:
        logger.error(f"Email generation failed: {e}")
        return {"error": str(e), "attempt": state.get("attempt", 0) + 1}

def validate_email(state: EmailGenState) -> str:
    """Check if safe_generate threw an error (e.g. unresolved placeholders)."""
    if state.get("error"):
        if state.get("attempt", 0) < 3:
            return "generate_email"
        else:
            return "mark_failed"
    return "save_draft"

async def save_draft(state: EmailGenState, config: RunnableConfig) -> dict:
    """Save the draft to generated_emails."""
    out = state["email_output"]
    if not out:
        return {"error": "No output"}
        
    db_session = config["configurable"]["db_session_factory"]
    async with db_session() as db:
        new_email = GeneratedEmail(
            lead_id=uuid.UUID(state["lead_id"]),
            campaign_id=uuid.UUID(state["campaign_id"]),
            template_id=uuid.UUID(state["template_id"]),
            sequence_position=1,
            subject=out.subject_options[0] if out.subject_options else "No Subject",
            subject_alternatives={"options": out.subject_options},
            body=out.body,
            body_original=out.body,
            status="draft"
        )
        db.add(new_email)
        await db.commit()
        return {"email_record_id": str(new_email.id), "error": None}

async def skip_generation(state: EmailGenState, config: RunnableConfig) -> dict:
    """Log skip reason."""
    logger.info(f"Skipping email gen for lead {state['lead_id']}")
    return {"error": None}

async def mark_failed(state: EmailGenState, config: RunnableConfig) -> dict:
    """Mark as failed."""
    logger.error(f"Email gen failed for lead {state['lead_id']} after 3 attempts.")
    return {"error": "Failed after 3 attempts"}

def build_email_gen_graph() -> StateGraph:
    workflow = StateGraph(EmailGenState)
    
    workflow.add_node("load_context", load_context)
    workflow.add_node("generate_email", generate_email)
    workflow.add_node("save_draft", save_draft)
    workflow.add_node("skip_generation", skip_generation)
    workflow.add_node("mark_failed", mark_failed)
    
    workflow.add_edge(START, "load_context")
    workflow.add_conditional_edges("load_context", check_research_ready)
    workflow.add_conditional_edges("generate_email", validate_email)
    
    workflow.add_edge("save_draft", END)
    workflow.add_edge("skip_generation", END)
    workflow.add_edge("mark_failed", END)
    
    # TODO: Use PostgresSaver in production
    memory = MemorySaver()
    return workflow.compile(checkpointer=memory)
