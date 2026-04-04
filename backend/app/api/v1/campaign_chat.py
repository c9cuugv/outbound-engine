import asyncio
import json
import re
from typing import AsyncGenerator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import get_current_user
from app.database import get_db
from app.models.user import User
from app.services.campaign_service import create_campaign
from app.workers.email_gen_tasks import generate_campaign_emails
from app.config import settings

router = APIRouter(prefix="/api/v1", tags=["campaign-chat"])

SYSTEM_PROMPT = """You are a campaign setup assistant for OutboundEngine, an AI cold email platform.
Your job: ask exactly 4 questions in order, then output campaign data.

QUESTIONS (ask one at a time, in order):
1. "What's your campaign called, and what are you selling?"
2. "Who's your ideal buyer — role, company size, or industry?"
3. "What's the main reason they should care? What problem do you solve?"
4. "How many emails in the sequence and what tone? (I'll default to 3 emails, professional-casual if you skip this)"

After the user answers question 4, output ONLY this JSON block (no other text after it):
<CAMPAIGN_DATA>{"name":"...","product_name":"...","product_description":"...","icp_description":"...","value_prop":"...","sequence_count":3,"tone":"professional-casual"}</CAMPAIGN_DATA>

Rules:
- Ask questions one at a time. Wait for the answer before asking the next.
- Keep questions short and conversational.
- Fill in reasonable defaults for any vague answers.
- product_description must be at least 60 characters.
- Never ask more than 4 questions."""


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]


def _extract_campaign_data(text: str) -> dict | None:
    """Parse the <CAMPAIGN_DATA>...</CAMPAIGN_DATA> block from LLM output."""
    match = re.search(r"<CAMPAIGN_DATA>(.*?)</CAMPAIGN_DATA>", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return None


async def _stream_llm(messages: list[dict]) -> AsyncGenerator[str, None]:
    """Stream tokens from the configured LLM provider."""
    provider = settings.EMAIL_GEN_PROVIDER.lower()

    if provider == "gemini":
        import google.generativeai as genai

        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-2.0-flash")
        # Gemini uses 'model' role, not 'assistant'; system role is not supported in history
        history = []
        for m in messages[:-1]:
            if m["role"] == "system":
                continue
            role = "model" if m["role"] == "assistant" else m["role"]
            history.append({"role": role, "parts": [m["content"]]})
        chat = model.start_chat(history=history)
        response = await asyncio.to_thread(
            chat.send_message,
            messages[-1]["content"],
            stream=True,
        )
        for chunk in response:
            if chunk.text:
                yield chunk.text

    elif provider == "groq":
        from groq import Groq

        client = Groq(api_key=settings.GROQ_API_KEY)
        stream = await asyncio.to_thread(
            client.chat.completions.create,
            model="llama-3.3-70b-versatile",
            messages=messages,
            stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    elif provider == "anthropic":
        import anthropic

        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        system_msg = next((m["content"] for m in messages if m["role"] == "system"), None)
        non_system = [m for m in messages if m["role"] != "system"]
        kwargs: dict = dict(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=non_system,
        )
        if system_msg:
            kwargs["system"] = system_msg
        with client.messages.stream(**kwargs) as stream:
            for text in stream.text_stream:
                yield text

    else:
        yield "Configuration error: no valid LLM provider set."


@router.post("/campaigns/chat")
async def campaign_chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """SSE streaming chat endpoint for AI-assisted campaign setup."""

    # Strip __init__ trigger — replace with a neutral opener so AI asks first question
    messages_clean = request.messages
    if messages_clean and messages_clean[0].content == "__init__":
        messages_clean = []

    llm_messages: list[dict] = [{"role": "system", "content": SYSTEM_PROMPT}]
    if not messages_clean:
        # Prompt the AI to open with question 1
        llm_messages.append({"role": "user", "content": "Start the campaign setup."})
    else:
        for m in messages_clean:
            llm_messages.append({"role": m.role, "content": m.content})

    async def generate() -> AsyncGenerator[bytes, None]:
        full_text = ""
        async for token in _stream_llm(llm_messages):
            full_text += token
            event = json.dumps({"type": "token", "content": token})
            yield f"data: {event}\n\n".encode()

        # Check whether AI finished and embedded campaign data
        campaign_data = _extract_campaign_data(full_text)
        if campaign_data:
            try:
                # sequence_count and tone are chat-only fields; strip before persisting
                campaign_data.pop("sequence_count", None)
                campaign_data.pop("tone", None)

                # create_campaign accepts a plain dict; inject owner_id here
                payload = {
                    "name": campaign_data.get("name", "New Campaign"),
                    "product_name": campaign_data.get("product_name"),
                    "product_description": campaign_data.get("product_description"),
                    "icp_description": campaign_data.get("icp_description"),
                    "value_prop": campaign_data.get("value_prop"),
                    "owner_id": current_user.id,
                }
                campaign = await create_campaign(db, payload)

                # Trigger async email generation via Celery
                generate_campaign_emails.delay(str(campaign.id))

                done_event = json.dumps({"type": "done", "campaign_id": str(campaign.id)})
                yield f"data: {done_event}\n\n".encode()
            except Exception as e:
                err_event = json.dumps({"type": "error", "content": str(e)})
                yield f"data: {err_event}\n\n".encode()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
