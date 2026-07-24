import asyncio
from typing import TypedDict, Any
import logging
import uuid
from datetime import datetime, timezone

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.runnables import RunnableConfig

from app.ai.schemas import SentimentOutput
from app.ai.safe_generate import safe_generate
from app.ai.factory import get_provider
from app.models.generated_email import GeneratedEmail
from app.models.reply import Reply
from app.models.lead import Lead
from sqlalchemy import select

logger = logging.getLogger(__name__)

class ReplyState(TypedDict):
    raw_email: dict             # {from, subject, body, in_reply_to, message_id}
    matched_email_id: str | None
    sentiment: str | None       # interested/not_interested/out_of_office/unsubscribe/question
    action_taken: str | None    # cancelled_sequence / flagged / ignored
    error: str | None

async def match_reply(state: ReplyState, config: RunnableConfig) -> dict:
    """Look up generated_emails by In-Reply-To header (mock logic if message_id unavailable)."""
    raw_email = state["raw_email"]
    db_session = config["configurable"]["db_session_factory"]
    async with db_session() as db:
        from_email = raw_email.get("from", "")
        lead = (await db.execute(select(Lead).where(Lead.email == from_email))).scalar_one_or_none()
        
        if lead:
            gen_email = (await db.execute(
                select(GeneratedEmail)
                .where(GeneratedEmail.lead_id == lead.id)
                .order_by(GeneratedEmail.created_at.desc())
                .limit(1)
            )).scalar_one_or_none()
            if gen_email:
                return {"matched_email_id": str(gen_email.id)}
                
    return {"matched_email_id": None}

def check_match(state: ReplyState) -> str:
    """Conditional: route to classify if match found."""
    if state.get("matched_email_id"):
        return "classify_sentiment"
    return "log_unmatched"

async def classify_sentiment(state: ReplyState, config: RunnableConfig) -> dict:
    """Call safe_generate for sentiment classification."""
    try:
        provider = get_provider("sentiment")
        body = state["raw_email"].get("body", "")
        
        sys_prompt = "You are an AI assistant that classifies the sentiment of email replies from leads."
        user_prompt = f"Please classify the following email reply:\\n\\n{body}"
        
        out = await safe_generate(
            provider=provider,
            system_prompt=sys_prompt,
            user_prompt=user_prompt,
            output_schema=SentimentOutput
        )
        # Note: assuming SentimentOutput has a 'sentiment' string field
        return {"sentiment": out.sentiment.value if hasattr(out.sentiment, "value") else str(out.sentiment)}
    except Exception as e:
        logger.error(f"Sentiment classification failed: {e}")
        return {"error": str(e)}

async def take_action(state: ReplyState, config: RunnableConfig) -> dict:
    """Based on sentiment, take business actions."""
    if not state.get("sentiment"):
        return {"action_taken": "ignored"}
        
    sentiment = state["sentiment"].lower()
    action = "ignored"
    
    db_session = config["configurable"]["db_session_factory"]
    async with db_session() as db:
        email_record = (await db.execute(select(GeneratedEmail).where(GeneratedEmail.id == uuid.UUID(state["matched_email_id"])))).scalar_one_or_none()
        if not email_record:
            return {"action_taken": "ignored"}
            
        lead = (await db.execute(select(Lead).where(Lead.id == email_record.lead_id))).scalar_one_or_none()
        if not lead:
            return {"action_taken": "ignored"}
            
        if sentiment in ["unsubscribe", "not_interested"]:
            logger.info(f"Cancel sequence for lead {lead.id}")
            action = "cancelled_sequence"
        elif sentiment in ["interested", "question"]:
            lead.status = "needs_followup"
            await db.commit()
            action = "flagged"
            
    return {"action_taken": action}

async def save_reply(state: ReplyState, config: RunnableConfig) -> dict:
    """Write reply to replies table."""
    db_session = config["configurable"]["db_session_factory"]
    async with db_session() as db:
        new_reply = Reply(
            email_id=uuid.UUID(state["matched_email_id"]),
            from_email=state["raw_email"].get("from", ""),
            subject=state["raw_email"].get("subject", ""),
            body=state["raw_email"].get("body", ""),
            sentiment=state.get("sentiment", "unknown"),
            received_at=datetime.now(timezone.utc)
        )
        db.add(new_reply)
        await db.commit()
    return {"error": None}

async def log_unmatched(state: ReplyState, config: RunnableConfig) -> dict:
    """Log that no match was found."""
    logger.warning("Unmatched reply received.")
    return {"error": None}

def build_reply_graph() -> StateGraph:
    workflow = StateGraph(ReplyState)
    
    workflow.add_node("match_reply", match_reply)
    workflow.add_node("classify_sentiment", classify_sentiment)
    workflow.add_node("take_action", take_action)
    workflow.add_node("save_reply", save_reply)
    workflow.add_node("log_unmatched", log_unmatched)
    
    workflow.add_edge(START, "match_reply")
    workflow.add_conditional_edges("match_reply", check_match)
    
    workflow.add_edge("classify_sentiment", "take_action")
    workflow.add_edge("take_action", "save_reply")
    
    workflow.add_edge("save_reply", END)
    workflow.add_edge("log_unmatched", END)
    
    # TODO: Use PostgresSaver in production
    memory = MemorySaver()
    return workflow.compile(checkpointer=memory)
