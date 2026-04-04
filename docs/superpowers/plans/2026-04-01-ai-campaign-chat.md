# AI Campaign Chat Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual campaign setup form with a 4-question AI chat that creates the campaign automatically.

**Architecture:** New SSE streaming endpoint on FastAPI backend handles the LLM conversation. When 4 answers are collected, it creates the campaign and triggers email generation. Frontend renders a chat UI, streams responses, then auto-advances to Select Leads.

**Tech Stack:** FastAPI SSE (StreamingResponse), existing LLM provider (Gemini/Groq/Anthropic via config), React + fetch EventSource, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-01-ai-campaign-chat-design.md`

---

## Chunk 1: Backend — SSE Chat Endpoint

### Task 1: campaign_chat.py — streaming endpoint

**Files:**
- Create: `backend/app/api/v1/campaign_chat.py`
- Create: `backend/tests/test_campaign_chat.py`

- [ ] **Step 1: Write failing test for chat endpoint existence**

```python
# backend/tests/test_campaign_chat.py
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_chat_endpoint_exists(client: AsyncClient, auth_headers: dict):
    resp = await client.post(
        "/api/v1/campaigns/chat",
        json={"messages": []},
        headers=auth_headers,
    )
    # Should not be 404
    assert resp.status_code != 404
```

- [ ] **Step 2: Run test to confirm it fails with 404**

```bash
cd backend && python -m pytest tests/test_campaign_chat.py::test_chat_endpoint_exists -v
```
Expected: FAIL — 404 Not Found

- [ ] **Step 3: Create `backend/app/api/v1/campaign_chat.py`**

```python
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
    match = re.search(r"<CAMPAIGN_DATA>(.*?)</CAMPAIGN_DATA>", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return None


async def _stream_llm(messages: list[dict]) -> AsyncGenerator[str, None]:
    """Stream tokens from the configured LLM provider."""
    provider = settings.email_gen_provider.lower()

    if provider == "gemini":
        import google.generativeai as genai
        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel("gemini-2.0-flash")
        history = [{"role": m["role"], "parts": [m["content"]]} for m in messages[:-1]]
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
        client = Groq(api_key=settings.groq_api_key)
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
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        with client.messages.stream(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=messages,
        ) as stream:
            for text in stream.text_stream:
                yield text

    else:
        yield "Configuration error: no valid LLM provider set."


import asyncio


@router.post("/campaigns/chat")
async def campaign_chat(
    request: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """SSE streaming chat endpoint for AI-assisted campaign setup."""

    llm_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for m in request.messages:
        llm_messages.append({"role": m.role, "content": m.content})

    async def generate() -> AsyncGenerator[bytes, None]:
        full_text = ""
        async for token in _stream_llm(llm_messages):
            full_text += token
            event = json.dumps({"type": "token", "content": token})
            yield f"data: {event}\n\n".encode()

        # Check if AI has finished and included campaign data
        campaign_data = _extract_campaign_data(full_text)
        if campaign_data:
            try:
                sequence_count = campaign_data.pop("sequence_count", 3)
                tone = campaign_data.pop("tone", "professional-casual")

                # Create campaign using existing service
                from app.schemas.campaigns import CampaignCreate
                payload = CampaignCreate(
                    name=campaign_data.get("name", "New Campaign"),
                    product_name=campaign_data.get("product_name"),
                    product_description=campaign_data.get("product_description"),
                    icp_description=campaign_data.get("icp_description"),
                    value_prop=campaign_data.get("value_prop"),
                )
                campaign = await create_campaign(db, payload, owner_id=current_user.id)

                # Trigger email generation (background task)
                await db.refresh(campaign)
                from app.services.campaign_service import update_campaign
                await update_campaign(db, campaign, {"status": "generating"})
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
```

- [ ] **Step 4: Register router in `backend/app/main.py`**

Add after existing router imports:
```python
from app.api.v1.campaign_chat import router as campaign_chat_router
```

Add after existing `app.include_router(...)` calls:
```python
app.include_router(campaign_chat_router)
```

- [ ] **Step 5: Run test — endpoint should now exist**

```bash
cd backend && python -m pytest tests/test_campaign_chat.py::test_chat_endpoint_exists -v
```
Expected: PASS (not 404)

- [ ] **Step 6: Write test for `_extract_campaign_data` helper**

```python
# Add to backend/tests/test_campaign_chat.py
from app.api.v1.campaign_chat import _extract_campaign_data

def test_extract_campaign_data_valid():
    text = 'Got it! <CAMPAIGN_DATA>{"name":"Q1","product_name":"Tool","product_description":"We help startups with AI outreach automation at scale today","icp_description":"SaaS founders","value_prop":"3x reply rates","sequence_count":3,"tone":"professional-casual"}</CAMPAIGN_DATA>'
    data = _extract_campaign_data(text)
    assert data["name"] == "Q1"
    assert data["product_name"] == "Tool"

def test_extract_campaign_data_none_when_missing():
    data = _extract_campaign_data("Just a normal AI response with no data block.")
    assert data is None
```

- [ ] **Step 7: Run helper tests**

```bash
cd backend && python -m pytest tests/test_campaign_chat.py -v
```
Expected: All PASS

- [ ] **Step 8: Check `create_campaign` service signature**

Read `backend/app/services/campaign_service.py` and verify `create_campaign` accepts `owner_id` parameter. If the signature is different, adjust the call in Step 3 accordingly.

- [ ] **Step 9: Commit**

```bash
cd /path/to/repo
git add backend/app/api/v1/campaign_chat.py backend/app/main.py backend/tests/test_campaign_chat.py
git commit -m "feat: add SSE campaign chat endpoint for AI-assisted setup"
```

---

## Chunk 2: Frontend — Chat Hook + Component

### Task 2: useCampaignChat hook

**Files:**
- Create: `frontend/src/hooks/useCampaignChat.ts`

- [ ] **Step 1: Create `frontend/src/hooks/useCampaignChat.ts`**

```typescript
import { useState, useCallback, useRef } from "react";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface UseCampaignChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  campaignId: string | null;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
}

export function useCampaignChat(): UseCampaignChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    const userMessage: ChatMessage = { role: "user", content: text };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setIsStreaming(true);
    setError(null);

    abortRef.current = new AbortController();

    try {
      const token = sessionStorage.getItem("access_token");
      const resp = await fetch("/api/v1/campaigns/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: nextMessages }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      // Add placeholder assistant message
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const event = JSON.parse(raw);

            if (event.type === "token") {
              assistantText += event.content;
              // Update last message (assistant placeholder)
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: assistantText,
                };
                return updated;
              });
            } else if (event.type === "done") {
              setCampaignId(event.campaign_id);
            } else if (event.type === "error") {
              setError(event.content);
            }
          } catch {
            // skip malformed event
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message);
      }
    } finally {
      setIsStreaming(false);
    }
  }, [messages]);

  return { messages, isStreaming, campaignId, error, sendMessage };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```
Expected: No errors for the new file

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useCampaignChat.ts
git commit -m "feat: add useCampaignChat hook for SSE streaming"
```

---

### Task 3: CampaignChatSetup component

**Files:**
- Create: `frontend/src/components/campaign/CampaignChatSetup.tsx`

- [ ] **Step 1: Create `frontend/src/components/campaign/CampaignChatSetup.tsx`**

```tsx
import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Send, Loader2 } from "lucide-react";
import { useCampaignChat } from "../../hooks/useCampaignChat";

interface Props {
  onComplete: (campaignId: string) => void;
}

type Stage = "intro" | "chatting" | "creating";

export default function CampaignChatSetup({ onComplete }: Props) {
  const [stage, setStage] = useState<Stage>("intro");
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, isStreaming, campaignId, error, sendMessage } = useCampaignChat();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // When campaign is created, transition to done
  useEffect(() => {
    if (campaignId) {
      setStage("creating");
      // Small delay so user sees the "Creating..." message
      const t = setTimeout(() => onComplete(campaignId), 1500);
      return () => clearTimeout(t);
    }
  }, [campaignId, onComplete]);

  // Focus input when chat starts
  useEffect(() => {
    if (stage === "chatting") {
      setTimeout(() => inputRef.current?.focus(), 300);
      // Fire the first AI message
      sendMessage("__init__");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    await sendMessage(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (stage === "intro") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-12 text-center"
      >
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--color-accent)]">
          <Zap size={26} className="text-[var(--color-surface-0)]" strokeWidth={2.5} />
        </div>
        <h2 className="mb-2 text-[18px] font-bold tracking-tight">AI Campaign Setup</h2>
        <p className="mb-8 max-w-sm text-[13px] text-[var(--color-ink-secondary)]">
          I'll ask you 4 short questions, then automatically write your campaign copy,
          audience targeting, and email sequence. Takes about 2 minutes.
        </p>
        <button
          onClick={() => setStage("chatting")}
          className="flex h-10 items-center gap-2 rounded-lg bg-[var(--color-accent)] px-6 text-[13px] font-semibold text-[var(--color-surface-0)] transition-all hover:bg-[var(--color-accent-hover)] active:scale-[0.97]"
        >
          Let's go <span>→</span>
        </button>
      </motion.div>
    );
  }

  if (stage === "creating") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        <Loader2 size={32} className="mb-4 animate-spin text-[var(--color-accent)]" />
        <p className="text-[14px] font-medium">Creating your campaign...</p>
        <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">
          Generating email sequence in the background
        </p>
      </motion.div>
    );
  }

  // Filter out the hidden __init__ trigger message
  const visibleMessages = messages.filter((m) => m.content !== "__init__");

  return (
    <div className="flex flex-col" style={{ height: "420px" }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-2">
        <AnimatePresence initial={false}>
          {visibleMessages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
            >
              {msg.role === "assistant" && (
                <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]">
                  <Zap size={13} className="text-[var(--color-surface-0)]" strokeWidth={2.5} />
                </div>
              )}
              <div
                className={`max-w-[78%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                  msg.role === "assistant"
                    ? "bg-[var(--color-surface-3)] text-[var(--color-ink-primary)]"
                    : "bg-[var(--color-accent)] text-[var(--color-surface-0)]"
                }`}
              >
                {msg.content}
                {msg.role === "assistant" && isStreaming && i === visibleMessages.length - 1 && (
                  <span className="ml-1 inline-block h-3 w-1.5 animate-pulse rounded-sm bg-current opacity-70" />
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {error && (
          <p className="text-center text-[12px] text-red-400">{error}</p>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-2 border-t border-white/[0.06] pt-3">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          placeholder={isStreaming ? "..." : "Type your answer..."}
          className="h-9 flex-1 rounded-lg border border-white/[0.08] bg-[var(--color-surface-2)] px-3 text-[13px] text-[var(--color-ink-primary)] placeholder-[var(--color-ink-muted)] outline-none transition-all focus:border-[var(--color-accent)]/50 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={isStreaming || !input.trim()}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)] text-[var(--color-surface-0)] transition-all hover:bg-[var(--color-accent-hover)] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isStreaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/campaign/CampaignChatSetup.tsx
git commit -m "feat: add CampaignChatSetup chat UI component"
```

---

## Chunk 3: Wire Into CampaignWizard + Remove Old Steps

### Task 4: Update CampaignWizard.tsx

**Files:**
- Modify: `frontend/src/pages/CampaignWizard.tsx`

- [ ] **Step 1: Read current CampaignWizard.tsx in full**

Read `frontend/src/pages/CampaignWizard.tsx` to understand current step structure before making changes.

- [ ] **Step 2: Update wizard steps array**

Replace current `STEPS` constant:
```typescript
// OLD
const STEPS = [
  { id: 1, label: "Product Info", icon: Package },
  { id: 2, label: "Select Leads", icon: Users },
  { id: 3, label: "Sequence", icon: Mail },
  { id: 4, label: "Sending", icon: Clock },
] as const;

// NEW — only 3 steps shown in progress bar (chat is pre-step)
const STEPS = [
  { id: 1, label: "Select Leads", icon: Users },
  { id: 2, label: "Sending", icon: Clock },
] as const;
```

- [ ] **Step 3: Add campaignId state and import CampaignChatSetup**

```typescript
import CampaignChatSetup from "../components/campaign/CampaignChatSetup";

// In component state:
const [campaignId, setCampaignId] = useState<string | null>(null);
const [chatDone, setChatDone] = useState(false);
```

- [ ] **Step 4: Replace step 0 (pre-step) rendering**

Before the progress bar / step indicator, add:
```tsx
// Show chat setup until campaign is created
if (!chatDone) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-[22px] font-bold tracking-tight">New Campaign</h1>
      <p className="mb-8 text-[13px] text-[var(--color-ink-secondary)]">
        Tell AI about your campaign — it handles the rest.
      </p>
      <Card>
        <CardBody className="py-6">
          <CampaignChatSetup
            onComplete={(id) => {
              setCampaignId(id);
              setChatDone(true);
              setStep(1);
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Update canAdvance() for new step numbering**

```typescript
// NEW (steps are now 1=Select Leads, 2=Sending)
const canAdvance = (): boolean => {
  switch (step) {
    case 1: return data.lead_list_ids.length > 0;
    case 2: return !!(data.sender_email && data.sender_name && data.sending_days.length > 0);
    default: return false;
  }
};
```

- [ ] **Step 6: Update step rendering**

```tsx
{step === 1 && <SelectLeadsStep data={data} update={update} />}
{step === 2 && <SendingStep data={data} update={update} />}
```

- [ ] **Step 7: Update handleGenerate to use existing campaignId**

Since campaign is already created by the chat, the final "Launch" step just needs to:
1. Update the campaign with lead_list_ids and sending settings
2. Launch it

```typescript
const handleLaunch = async () => {
  if (!campaignId) return;
  setGenerating(true);
  try {
    // PATCH campaign with lead lists + sending settings
    await api.patch(`/campaigns/${campaignId}`, {
      sending_timezone: data.sending_timezone,
      sending_days: data.sending_days,
      sending_window_start: data.sending_window_start,
      sending_window_end: data.sending_window_end,
      max_emails_per_day: data.max_emails_per_day,
      sender_email: data.sender_email,
      sender_name: data.sender_name,
    });
    // Associate leads
    await api.post(`/campaigns/${campaignId}/leads`, {
      lead_list_ids: data.lead_list_ids,
    });
    // Poll until emails are generated, then redirect to review
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/campaigns/${campaignId}`);
        const c = await res.json();
        if (c.status === "review") {
          clearInterval(poll);
          navigate(`/campaigns/${campaignId}/review`);
        }
      } catch { /* keep polling */ }
    }, 3000);
  } catch {
    setGenerating(false);
  }
};
```

> **Note:** Check `backend/app/api/v1/campaigns.py` for the actual lead association endpoint. It may be `/campaigns/{id}/leads` or similar. Adjust accordingly.

- [ ] **Step 8: Remove unused imports**

Remove `Package`, `Mail`, `ProductInfoStep`, `SelectTemplatesStep` imports if they're no longer used.

- [ ] **Step 9: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```
Fix any type errors before committing.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/CampaignWizard.tsx
git commit -m "feat: wire CampaignChatSetup into wizard, remove manual form steps"
```

---

## Chunk 4: Backend — LLM Init Message + Gemini Fix

### Task 5: Handle `__init__` trigger message

The frontend sends `__init__` as the first user message to kick off the AI's first question. The backend must strip this and respond with the first question.

**Files:**
- Modify: `backend/app/api/v1/campaign_chat.py`

- [ ] **Step 1: Add init message handling**

In `campaign_chat` endpoint, before building `llm_messages`:
```python
# Strip __init__ trigger — replace with a neutral opener
messages_clean = request.messages
if messages_clean and messages_clean[0].content == "__init__":
    messages_clean = []  # Empty history = AI asks first question

llm_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
if not messages_clean:
    # Prompt the AI to ask the first question
    llm_messages.append({"role": "user", "content": "Start the campaign setup."})
else:
    for m in messages_clean:
        llm_messages.append({"role": m.role, "content": m.content})
```

- [ ] **Step 2: Write test for init message stripping**

```python
# Add to test_campaign_chat.py
@pytest.mark.asyncio
async def test_chat_strips_init_message(client: AsyncClient, auth_headers: dict):
    """Chat with __init__ should return a streaming response, not an error."""
    async with client.stream(
        "POST",
        "/api/v1/campaigns/chat",
        json={"messages": [{"role": "user", "content": "__init__"}]},
        headers=auth_headers,
    ) as resp:
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]
```

- [ ] **Step 3: Run test**

```bash
cd backend && python -m pytest tests/test_campaign_chat.py -v
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/v1/campaign_chat.py backend/tests/test_campaign_chat.py
git commit -m "fix: handle __init__ trigger message in chat endpoint"
```

---

## Chunk 5: Integration Test + Playwright E2E

### Task 6: Manual + Playwright verification

- [ ] **Step 1: Rebuild and restart API container**

```bash
cd /path/to/outbound-engine
docker compose up api --build -d
```

- [ ] **Step 2: Start frontend dev server**

```bash
cd frontend && npm run dev
```

- [ ] **Step 3: Playwright — navigate to /campaigns/new**

Use Playwright to:
1. Navigate to `http://localhost:3000/login`
2. Log in with test credentials
3. Navigate to `http://localhost:3000/campaigns/new`
4. Verify intro card is visible (heading "AI Campaign Setup")
5. Screenshot → `logs/05-campaign-chat-intro.png`

- [ ] **Step 4: Playwright — complete the chat flow**

1. Click "Let's go →"
2. Verify AI first message appears (chat interface visible)
3. Answer each question:
   - Q1: "Test Campaign — AI cold email tool for startups"
   - Q2: "Series A SaaS founders, 20-50 employees"
   - Q3: "Saves 10 hours/week on manual outreach"
   - Q4: "3 emails, professional-casual"
4. Verify transition to "Creating your campaign..." screen
5. Verify redirect to `/leads` or `/campaigns` with campaign created
6. Screenshot → `logs/06-campaign-chat-complete.png`

- [ ] **Step 5: Verify campaign in database**

```bash
docker exec outbound-engine-db-1 psql -U postgres -d outbound -c "SELECT id, name, status, product_description FROM campaigns ORDER BY created_at DESC LIMIT 3;"
```
Expected: New campaign row with `status='generating'` and populated `product_description`

- [ ] **Step 6: Commit final screenshots**

```bash
git add logs/.gitkeep  # only .gitkeep, not the PNG files
git commit -m "test: verify AI campaign chat E2E flow"
```

---

## Chunk 6: Obsidian Memory — Project Context

### Task 7: Capture project learnings in Obsidian

- [ ] **Step 1: Check Obsidian vault path**

Run `ls ~/` or check Obsidian settings for vault location.

- [ ] **Step 2: Create project note in Obsidian vault**

Create a note at `<vault>/OutboundEngine/project-context.md` with:
- Project purpose (AI outbound email platform)
- Tech stack (FastAPI, React, Celery, Postgres, Redis)
- Key files map (backend/app/main.py, frontend/src/pages/CampaignWizard.tsx, etc.)
- Known issues found and fixed (localStorage vs setTokens, in-memory session loss)
- AI chat feature design decisions

- [ ] **Step 3: Create error log note**

Create `<vault>/OutboundEngine/error-log.md` tracking:
- Bug: localStorage/setTokens mismatch — root cause + fix
- Bug: No auth guard in AppLayout — fix
- Bug: Session lost on page refresh — fix (sessionStorage)

---

## Summary of All Files

| File | Action |
|------|--------|
| `backend/app/api/v1/campaign_chat.py` | CREATE — SSE chat endpoint |
| `backend/app/main.py` | MODIFY — register router |
| `backend/tests/test_campaign_chat.py` | CREATE — endpoint + helper tests |
| `frontend/src/hooks/useCampaignChat.ts` | CREATE — SSE streaming hook |
| `frontend/src/components/campaign/CampaignChatSetup.tsx` | CREATE — intro card + chat UI |
| `frontend/src/pages/CampaignWizard.tsx` | MODIFY — wire chat, remove form steps |
