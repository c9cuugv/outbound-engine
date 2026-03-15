# Developer B: AI Logic & Frontend Views — Detailed Implementation Plan

> **Owner:** Developer B
> **Scope:** React UI, LLM Prompts, Web Scraper Logic, AI Provider Abstraction
> **Dependency:** Consumes Developer A's FastAPI endpoints, Celery infrastructure, and DB models

---

## Table of Contents

1. [Phase 1: AI Foundation (Days 1–3)](#phase-1-ai-foundation)
2. [Phase 2: Research Pipeline (Days 3–6)](#phase-2-research-pipeline)
3. [Phase 3: Email AI Layer (Days 5–8)](#phase-3-email-ai-layer)
4. [Phase 4: Frontend — React App Scaffold (Day 7)](#phase-4-frontend-scaffold)
5. [Phase 5: Frontend — Lead Management (Days 8–10)](#phase-5-lead-management)
6. [Phase 6: Frontend — Campaign Flow (Days 10–14)](#phase-6-campaign-flow)
7. [Phase 7: Frontend — Dashboard & Analytics (Days 14–17)](#phase-7-dashboard)
8. [File Tree](#file-tree)
9. [API Contracts (Dev A Dependencies)](#api-contracts)
10. [Tech Stack](#tech-stack)

---

## Tech Stack

### Backend (Python — AI/Scraper layer)
| Concern | Library |
|---------|---------|
| LLM — Gemini | `google-generativeai` |
| LLM — Groq | `groq` |
| LLM — Anthropic | `anthropic` |
| LLM — Claude CLI | `subprocess` (calls `claude` binary) |
| Validation | `pydantic` v2 |
| Scraping | `httpx` + `beautifulsoup4` |
| Task queue | Celery (Dev A provides infra) |

### Frontend (React + TypeScript)
| Concern | Library |
|---------|---------|
| Framework | React 18 + TypeScript |
| Routing | React Router v6 |
| Styling | Tailwind CSS 3 |
| Charts | Recharts |
| HTTP | Axios |
| Forms | React Hook Form + Zod |
| State | React Query (TanStack Query v5) |
| WebSocket | Native WebSocket API |
| Icons | Lucide React |
| Animations | Framer Motion |

---

## Phase 1: AI Foundation (Days 1–3)

### Story 3.2 — Pydantic Output Schemas (Track B-1)
**Time:** ~3 hours | **Priority:** Start immediately (no dependencies)
**File:** `backend/app/ai/schemas.py`

**Three schemas to build:**

#### 1. `ResearchOutput`
```python
class ResearchOutput(BaseModel):
    company_summary: str           # max_length=500, hallucination validator
    industry: str
    company_size_estimate: str     # pattern: 1-10|11-50|51-200|201-1000|1000+|unknown
    tech_stack_signals: list[str]  # max_length=20
    potential_pain_points: list[str]   # min=1, max=5
    personalization_hooks: list[str]   # min=1, max=5
    confidence_score: float        # ge=0.0, le=1.0
```

**Hallucination validator on `company_summary`** — REJECT if contains:
- "founded in", "revenue of", "million users", "raised $", "valued at", "according to"

#### 2. `EmailOutput`
```python
class EmailOutput(BaseModel):
    subject_options: list[str]     # min=1, max=3, each 2-10 words
    body: str                      # min=50, max=2000
```
**Validators:** body must NOT contain `{first_name}`, `{company}`, `[INSERT`, `[YOUR`, `{{`, `}}`, `<PLACEHOLDER`

#### 3. `SentimentOutput`
```python
class SentimentOutput(BaseModel):
    sentiment: str       # pattern: interested|not_interested|out_of_office|unsubscribe|question
    confidence: float    # ge=0.0, le=1.0
    reasoning: str       # max_length=200
```

**Tests:** 25+ test cases across all three schemas in `tests/test_schemas.py`

**Done when:** `pytest tests/test_schemas.py -v` — all green, every hallucination pattern caught.

---

### Story 3.1 — Provider Interface and Factory (M1-1)
**Time:** ~5 hours | **Depends on:** Schemas complete
**Files:** `backend/app/ai/providers.py`, `backend/app/ai/factory.py`

#### Provider Classes (all implement `AIProvider` protocol):
| Class | SDK | Notes |
|-------|-----|-------|
| `GeminiProvider` | `google-generativeai` | Default provider |
| `GroqProvider` | `groq` | Fast inference |
| `ClaudeCodeProvider` | `subprocess` → `claude` CLI | Local dev option |
| `AnthropicAPIProvider` | `anthropic` | Production Anthropic |

Each provider implements:
```python
class AIProvider(Protocol):
    async def generate(self, system_prompt: str, user_prompt: str) -> str: ...
    async def generate_json(self, system_prompt: str, user_prompt: str) -> dict: ...
```

#### Factory (`factory.py`):
```python
def get_provider(task: str) -> AIProvider:
    # Reads {task}_PROVIDER from settings (e.g., RESEARCH_PROVIDER=gemini)
    # Returns configured provider instance
    # Defaults to "gemini"
    # Raises ConfigError if required API key missing
```

**Done when:**
- `get_provider("research")` returns GeminiProvider when `RESEARCH_PROVIDER=gemini`
- Missing API key → `ConfigError("GEMINI_API_KEY required for gemini provider")`
- Default provider is gemini when env var not set
- `await provider.generate("system", "Say hello")` returns a string
- `await provider.generate_json("system", "Return {\"ok\": true}")` parses correctly

---

### Story 3.3 — Safe Generate with Retry (M1-2)
**Time:** ~3 hours | **Depends on:** Providers + Schemas
**Files:** `backend/app/ai/safe_generate.py`, `backend/app/ai/exceptions.py`

**The ONE function the entire app uses to call LLMs.**

#### Retry Loop Logic:
```
1. Build prompt with schema instructions appended
2. Call provider.generate()
3. Parse JSON from response (strip markdown fences like ```json ... ```)
4. Validate with Pydantic schema
5. On JSON error → retry with error message in prompt
6. On validation error → retry with specific validation error in prompt
7. After max_retries → raise GenerationError
```

**Function signature:**
```python
async def safe_generate(
    provider: AIProvider,
    system_prompt: str,
    user_prompt: str,
    output_schema: type[BaseModel],
    max_retries: int = 3
) -> BaseModel:
```

**Done when:**
- Mock provider returning valid JSON → returns validated model on attempt 1
- Mock provider returning ` ```json\n{...}\n``` ` → strips fences, parses correctly
- Bad JSON on try 1, valid on try 2 → succeeds on attempt 2
- Schema-invalid JSON on all tries → raises `GenerationError`
- Retry prompt includes the ORIGINAL user prompt (doesn't lose context)

---

## Phase 2: Research Pipeline (Days 3–6)

### Story 4.1 — Company Website Scraper (M1-3)
**Time:** ~3 hours | **Can run parallel with 4.2**
**File:** `backend/app/services/scraper.py`

```python
class CompanyScraper:
    PAGES = ['/', '/about', '/about-us', '/company', '/blog', '/careers', '/pricing']

    async def scrape_company(self, domain: str) -> dict:
        # Returns {"/" : "homepage text...", "/about": "about text...", ...}
```

**Implementation details:**
- Uses `httpx.AsyncClient` for HTTP requests
- `BeautifulSoup` to strip HTML → extract text
- Remove `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>` tags
- Each page text truncated to **2000 chars**
- Tries HTTPS first, falls back to HTTP
- Timeout: **10 seconds per page**
- User-Agent: `"OutboundEngine/1.0 (research bot)"`
- Unreachable domain → returns `{}` (no exception)

**Done when:**
- `scrape_company("stripe.com")` returns dict with at least `/` key
- Text has no HTML tag content
- Unreachable domain → `{}`

---

### Story 4.2 — Signal Collector (M1-4)
**Time:** ~3 hours | **Can run parallel with 4.1**
**File:** `backend/app/services/signals.py`

#### Tech Detection — scan homepage HTML for:
| Signal Type | What to Check |
|-------------|---------------|
| `<meta>` tags | `name="generator"` values |
| Script patterns | `react`, `angular`, `vue`, `jquery`, `stripe.js`, `segment`, `hubspot`, `intercom`, `gtag`/`google-analytics` |
| Meta/link patterns | `shopify`, `wordpress`, `webflow`, `squarespace`, `wix` |

#### Hiring Signals — check for 200 response:
- `https://{domain}.greenhouse.io/jobs`
- `https://jobs.lever.co/{domain}`
- 5-second timeout each

**Done when:**
- `get_tech_signals("stripe.com")` returns list including recognized technologies
- No detectable tech → returns `[]`
- Hiring check timeout → returns `None`
- All HTTP errors caught and logged, never bubble up

---

### Story 4.3 — Research Prompts (Track D-1)
**Time:** ~2 hours | **Depends on:** Schemas
**File:** `backend/app/ai/prompts/research.py`

#### `RESEARCH_SYSTEM_PROMPT` constant:
```
You are a B2B sales research analyst.
Your job is to analyze scraped website data and produce a structured research brief.

CRITICAL RULES:
- Use ONLY the information provided below.
- Do not invent any facts, statistics, funding amounts, revenue figures, or user counts.
- If information is not available in the provided data, set the field to "unknown".
- Never guess founding dates, team sizes, or revenue unless explicitly stated in the data.
- Base your analysis solely on the text between the VERIFIED DATA markers.
```

#### `build_research_prompt(lead, scraped_data, signals) -> str`:
- Inserts lead info: `{first_name} {last_name}, {title} at {company_name} ({company_domain})`
- Wraps scraped data in `--- VERIFIED DATA ---` / `--- END DATA ---` markers
- Includes signal data (tech stack, hiring) if available
- Requests JSON response matching `ResearchOutput` schema
- **Truncates total content to 4000 characters** if scraped data is too long

**Validation:** Paste generated prompt into Gemini/Claude manually → verify output matches ResearchOutput schema.

---

### Story 4.4 — Research Worker (M2-1)
**Time:** ~5 hours | **Depends on:** Scraper + Signals + Prompts + Safe Generate
**File:** `backend/app/workers/research_tasks.py`

**Hooks into Dev A's Celery setup.** Two tasks:

1. `research_lead(lead_id)` — single lead
2. `research_lead_list(lead_list_id)` — dispatches individual tasks for each pending lead

#### Pipeline for `research_lead`:
```
1. Set lead.research_status = 'in_progress'
2. Scrape company website (CompanyScraper)
3. IF empty scrape → set status='failed', note='Website unreachable', STOP
4. Collect signals (SignalCollector)
5. Build prompt (build_research_prompt)
6. Call safe_generate with ResearchOutput schema
7. IF confidence < 0.6 → status = 'needs_review'
8. ELSE → status = 'completed'
9. Store research fields on lead record
```

**Configuration:**
- Rate limited: `10/m`
- Retries: 3 with backoff (60s, 120s, 180s)
- Empty scrape → `failed` + note, NO LLM call made
- LLM failure (`GenerationError`) → `failed` + note
- Low confidence → `needs_review`
- Success → research fields populated on lead record

---

## Phase 3: Email AI Layer (Days 5–8)

### Story 5.3 — Email Generation Prompts (Track D-2)
**Time:** ~3 hours | **Depends on:** Schemas
**File:** `backend/app/ai/prompts/email_gen.py`

#### `build_system_prompt(campaign: dict) -> str`:
Includes product context, ICP, value prop, and RULES:
- Maximum `{max_word_count}` words
- **Banned words:** "synergy", "leverage", "cutting-edge", "game-changer", "circle back", "touch base", "move the needle", "ecosystem", "holistic"
- **Banned patterns:** "limited time", "act now", "don't miss out", "I hope this email finds you well", "I came across your company"
- Sound like a real human, not a marketing bot
- One clear CTA per email
- Paragraphs: 2-3 sentences max
- Reference specific details from research

#### `build_email_prompt(template, lead, research, previous_context=None) -> str`:
- **Step 1** (initial outreach): Cold email with research-backed personalization
- **Step 2** (follow-up): References Step 1, adds new value angle
- **Step 3** (breakup): Last chance, direct ask

**Each step prompt includes:** lead info, research data (company summary, pain points, hooks, developments), previous email context for steps 2+.

---

### Story 5.2 — Email Template System
**Time:** ~2 hours (Dev B writes the actual AI template prompts, Dev A creates DB/API)
**File:** `backend/app/ai/templates/` (seed data definitions)

**3 seed templates:**

| Template | Position | Day Delay | Tone |
|----------|----------|-----------|------|
| Initial Outreach | 1 | 0 | professional-casual |
| Value Follow-up | 2 | 3 | professional-casual |
| Breakup Email | 3 | 7 | professional-casual |

Each template defines: `name`, `system_prompt`, `generation_prompt`, `max_word_count` (default 120), `tone`, `sequence_position`, `days_delay`.

---

## Phase 4: Frontend — React App Scaffold (Day 7)

### Project Initialization
**Time:** ~4 hours

#### Setup Steps:
1. `npm create vite@latest frontend -- --template react-ts`
2. Install dependencies:
   ```
   npm install react-router-dom axios @tanstack/react-query recharts
   npm install react-hook-form zod @hookform/resolvers
   npm install lucide-react framer-motion
   npm install -D tailwindcss @tailwindcss/forms @tailwindcss/typography postcss autoprefixer
   ```
3. Configure Tailwind with custom theme
4. Setup project structure (see [File Tree](#file-tree))
5. Configure React Query provider
6. Setup Axios instance with base URL and interceptors
7. Setup React Router with route definitions
8. Create shared layout component (sidebar + header)

#### Design System Foundation:
- **Typography:** DM Sans (body) + Space Mono (data/numbers) — distinctive, not generic
- **Color palette:** Deep navy primary (#0F172A), electric teal accent (#06B6D4), warm coral for alerts (#F97316), slate grays for surfaces
- **Dark theme by default** — professional tool aesthetic
- **Spacing:** 8px grid system via Tailwind
- **Components:** Button, Badge, Card, Modal, Table, Input, Select, Tabs

#### Routes:
| Path | Component | Story |
|------|-----------|-------|
| `/leads` | LeadTable | 2.4 |
| `/leads/:id/research` | ResearchPanel | 4.5 |
| `/campaigns/new` | CampaignWizard | 5.6 |
| `/campaigns/:id/review` | EmailReviewQueue | 5.7 |
| `/campaigns/:id/dashboard` | CampaignDashboard | 7.3 |
| `/campaigns/:id/leads/:leadId` | LeadTimeline | 7.4 |

---

## Phase 5: Frontend — Lead Management (Days 8–10)

### Story 2.4 — Lead Table (`/leads`) (UI-A part 1)
**Time:** ~5 hours
**File:** `frontend/src/pages/LeadTable.tsx`

#### Features:
- **Sortable columns:** Name, Email, Company, Title, Status, Research Status, Created
- **Filter dropdowns:** Status, Research Status
- **Search box:** name / email / company (debounced 300ms)
- **Pagination:** page size selector (25/50/100), prev/next, total count
- **CSV Upload:** "Upload CSV" button → file picker → import summary modal
- **Status badges with colors:**
  | Status | Color |
  |--------|-------|
  | pending | gray |
  | in_progress | yellow/amber |
  | completed | green |
  | failed | red |
  | needs_review | orange |
- **Empty state:** "No leads yet. Upload a CSV to get started."

#### API Integration:
```
GET /api/v1/leads?page=1&size=25&sort=created_at&order=desc&status=&search=
POST /api/v1/leads/import  (multipart/form-data with CSV file)
```

#### Components to build:
- `LeadTable.tsx` — main page
- `LeadTableRow.tsx` — individual row with expandable research
- `StatusBadge.tsx` — reusable status indicator
- `CSVUploadModal.tsx` — file upload + validation + summary
- `SearchFilter.tsx` — search + filter bar
- `Pagination.tsx` — page controls

---

### Story 4.5 — Research Panel (UI-A part 2)
**Time:** ~3 hours
**File:** `frontend/src/pages/LeadTable.tsx` (expanded rows) + `frontend/src/components/ResearchPanel.tsx`

#### Features:
- **"Research All" button** → triggers research for all pending leads, polls every 5s
- **Expandable row** per lead showing research data:
  - Company summary paragraph
  - Industry label
  - Company size badge
  - Tech stack as colored tag pills
  - Pain points as numbered list
  - Personalization hooks as bullet list
  - **Confidence %** with color coding:
    | Range | Color |
    |-------|-------|
    | > 80% | Green |
    | 60–80% | Yellow |
    | < 60% | Red |
  - `needs_review` → orange warning banner with icon

#### API Integration:
```
GET /api/v1/leads/{id}/research
POST /api/v1/leads/research-all  (triggers bulk research)
GET /api/v1/leads?research_status=in_progress  (polling)
```

---

## Phase 6: Frontend — Campaign Flow (Days 10–14)

### Story 5.6 — Campaign Builder (`/campaigns/new`) (UI-B part 1)
**Time:** ~10 hours
**File:** `frontend/src/pages/CampaignWizard.tsx`

#### 4-Step Wizard:

**Step 1 — Product Info:**
- Campaign name (text input)
- Product name (text input)
- Product description (textarea, 500 char limit)
- ICP description (textarea)
- Value proposition (textarea)
- Validation: all required, description min 50 chars

**Step 2 — Select Leads:**
- Pick from existing lead lists (dropdown + checkbox multi-select)
- OR upload new CSV
- Shows selected lead count
- Minimum 1 lead required to proceed

**Step 3 — Sequence Config:**
- Template cards displayed as visual sequence: Email 1 → Email 2 → Email 3
- Each card shows: template name, day delay (editable), word count
- Arrow connectors between cards
- Can reorder via drag (stretch goal — skip for MVP)

**Step 4 — Sending Settings:**
- Timezone selector (dropdown)
- Sending days (checkbox group: Mon–Sun)
- Sending window: start time + end time (time pickers)
- Max emails per day (number input, default 50)

**"Generate Emails" button:**
- POST `/api/v1/campaigns` with all wizard data
- POST `/api/v1/campaigns/{id}/generate`
- Shows progress spinner
- Polls campaign status every 5s
- Redirects to `/campaigns/{id}/review` when complete

#### Components:
- `CampaignWizard.tsx` — main orchestrator with step state
- `WizardStepIndicator.tsx` — progress bar (1→2→3→4)
- `ProductInfoStep.tsx` — step 1 form
- `SelectLeadsStep.tsx` — step 2 with list picker
- `SequenceConfigStep.tsx` — step 3 template cards
- `SendingSettingsStep.tsx` — step 4 scheduling
- `GeneratingOverlay.tsx` — progress/polling overlay

---

### Story 5.7 — Email Review Queue (`/campaigns/{id}/review`) (UI-B part 2)
**Time:** ~6 hours
**File:** `frontend/src/pages/EmailReviewQueue.tsx`

#### Features:
- **Stats bar at top:** drafts count / approved count / failed count (colored)
- **Email cards grouped by lead** (collapsible sections per lead)
- **Expand card** reveals:
  - Editable subject line (contenteditable or input)
  - Editable body (textarea with rich formatting)
  - Side panel: research data for cross-reference
- **Per-email actions:**
  - ✅ Approve — moves to approved
  - ✏️ Edit — inline editing mode
  - 🔄 Regenerate — calls API to regenerate this specific email
- **Bulk actions:**
  - "Approve All" button — approves all drafts at once
- **"Launch Campaign"** button — appears when ≥1 email approved
  - Confirmation modal before launch

#### API Integration:
```
GET /api/v1/campaigns/{id}/emails?status=draft
PATCH /api/v1/campaigns/{id}/emails/{email_id}  (approve, edit body/subject)
POST /api/v1/campaigns/{id}/emails/{email_id}/regenerate
POST /api/v1/campaigns/{id}/launch
```

#### Components:
- `EmailReviewQueue.tsx` — main page
- `EmailStatsBar.tsx` — draft/approved/failed counters
- `LeadEmailGroup.tsx` — collapsible section per lead
- `EmailCard.tsx` — individual email with edit/approve/regenerate
- `ResearchSidePanel.tsx` — research data reference
- `LaunchConfirmModal.tsx` — confirmation before launch

---

## Phase 7: Frontend — Dashboard & Analytics (Days 14–17)

### Story 7.3 — Campaign Dashboard (`/campaigns/{id}/dashboard`) (UI-C part 1)
**Time:** ~8 hours
**File:** `frontend/src/pages/CampaignDashboard.tsx`

#### Features:
- **Campaign header:** Name + status badge + pause/resume button
- **4 metric cards (KPI row):**
  | Metric | Format |
  |--------|--------|
  | Sent | absolute number |
  | Opened | percentage |
  | Clicked | percentage |
  | Replied | percentage |
- **Line chart:** Daily sends + open rate overlay (Recharts `<ComposedChart>`)
- **Bar chart:** Performance by sequence step (Email 1 vs 2 vs 3)
- **Live activity feed** via WebSocket (`/ws/campaigns/{id}/events`)
  - Scrolling list of events with timestamps
  - Auto-scrolls to latest
- **Sentiment pie chart** (Recharts `<PieChart>`)

#### API Integration:
```
GET /api/v1/campaigns/{id}/analytics
WebSocket /ws/campaigns/{id}/events
```

#### Components:
- `CampaignDashboard.tsx` — main layout
- `MetricCard.tsx` — individual KPI card with icon + trend
- `DailySendsChart.tsx` — line chart (Recharts)
- `SequencePerformanceChart.tsx` — bar chart (Recharts)
- `SentimentPieChart.tsx` — pie chart (Recharts)
- `LiveActivityFeed.tsx` — WebSocket-powered event feed
- `PauseResumeButton.tsx` — campaign control

---

### Story 7.4 — Lead Timeline (`/campaigns/{id}/leads/{leadId}`) (UI-C part 2)
**Time:** ~4 hours
**File:** `frontend/src/pages/LeadTimeline.tsx`

#### Features:
- **Lead info header:** Name, email, company, title
- **Collapsible research summary** (reuses ResearchPanel component)
- **Chronological timeline with event icons:**
  | Event | Icon | Color |
  |-------|------|-------|
  | Sent | mail | blue |
  | Opened | eye | green |
  | Clicked | link | purple |
  | Replied | message | teal |
- **Relative time** ("2 hours ago") + absolute on hover tooltip
- **Reply preview:** 200 char truncate + "Show more" expand

---

## File Tree

```
backend/
├── app/
│   ├── ai/
│   │   ├── __init__.py
│   │   ├── providers.py          # 3.1 — AIProvider classes (Gemini, Groq, Claude, Anthropic)
│   │   ├── factory.py            # 3.1 — get_provider() factory function
│   │   ├── schemas.py            # 3.2 — ResearchOutput, EmailOutput, SentimentOutput
│   │   ├── safe_generate.py      # 3.3 — safe_generate() retry wrapper
│   │   ├── exceptions.py         # 3.3 — GenerationError, ConfigError
│   │   └── prompts/
│   │       ├── __init__.py
│   │       ├── research.py       # 4.3 — RESEARCH_SYSTEM_PROMPT + build_research_prompt()
│   │       └── email_gen.py      # 5.3 — build_system_prompt() + build_email_prompt()
│   ├── services/
│   │   ├── scraper.py            # 4.1 — CompanyScraper class
│   │   └── signals.py            # 4.2 — SignalCollector (tech detection + hiring)
│   └── workers/
│       └── research_tasks.py     # 4.4 — research_lead() + research_lead_list() Celery tasks
├── tests/
│   ├── test_schemas.py           # 25+ tests for all Pydantic schemas
│   ├── test_providers.py         # Provider + factory tests
│   ├── test_safe_generate.py     # Retry logic tests with mocks
│   ├── test_scraper.py           # Scraper tests
│   ├── test_signals.py           # Signal collector tests
│   ├── test_prompts.py           # Prompt builder tests
│   └── test_research_worker.py   # Worker pipeline tests

frontend/
├── public/
├── src/
│   ├── main.tsx
│   ├── App.tsx                    # Router + QueryProvider + Layout
│   ├── api/
│   │   ├── client.ts              # Axios instance with interceptors
│   │   ├── leads.ts               # Lead API functions
│   │   ├── campaigns.ts           # Campaign API functions
│   │   └── analytics.ts           # Analytics API functions
│   ├── hooks/
│   │   ├── useLeads.ts            # React Query hooks for leads
│   │   ├── useCampaigns.ts        # React Query hooks for campaigns
│   │   ├── useAnalytics.ts        # React Query hooks for analytics
│   │   ├── useWebSocket.ts        # WebSocket connection hook
│   │   └── usePolling.ts          # Polling hook for status checks
│   ├── components/
│   │   ├── ui/                    # Design system primitives
│   │   │   ├── Button.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Table.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Tabs.tsx
│   │   │   └── Spinner.tsx
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx      # Sidebar + header + main content
│   │   │   ├── Sidebar.tsx
│   │   │   └── Header.tsx
│   │   ├── leads/
│   │   │   ├── LeadTableRow.tsx
│   │   │   ├── StatusBadge.tsx
│   │   │   ├── CSVUploadModal.tsx
│   │   │   ├── SearchFilter.tsx
│   │   │   ├── Pagination.tsx
│   │   │   └── ResearchPanel.tsx
│   │   ├── campaigns/
│   │   │   ├── WizardStepIndicator.tsx
│   │   │   ├── ProductInfoStep.tsx
│   │   │   ├── SelectLeadsStep.tsx
│   │   │   ├── SequenceConfigStep.tsx
│   │   │   ├── SendingSettingsStep.tsx
│   │   │   ├── GeneratingOverlay.tsx
│   │   │   ├── EmailStatsBar.tsx
│   │   │   ├── LeadEmailGroup.tsx
│   │   │   ├── EmailCard.tsx
│   │   │   ├── ResearchSidePanel.tsx
│   │   │   └── LaunchConfirmModal.tsx
│   │   └── dashboard/
│   │       ├── MetricCard.tsx
│   │       ├── DailySendsChart.tsx
│   │       ├── SequencePerformanceChart.tsx
│   │       ├── SentimentPieChart.tsx
│   │       ├── LiveActivityFeed.tsx
│   │       └── PauseResumeButton.tsx
│   ├── pages/
│   │   ├── LeadTable.tsx          # 2.4 + 4.5
│   │   ├── CampaignWizard.tsx     # 5.6
│   │   ├── EmailReviewQueue.tsx   # 5.7
│   │   ├── CampaignDashboard.tsx  # 7.3
│   │   └── LeadTimeline.tsx       # 7.4
│   ├── types/
│   │   ├── lead.ts                # Lead, ResearchData interfaces
│   │   ├── campaign.ts            # Campaign, Template, Email interfaces
│   │   └── analytics.ts           # Analytics, Event interfaces
│   └── styles/
│       └── globals.css            # Tailwind imports + custom CSS vars
├── tailwind.config.ts
├── tsconfig.json
├── vite.config.ts
└── package.json
```

---

## API Contracts (Dev A Dependencies)

These are the endpoints Developer B's frontend consumes. Developer A builds them.

### Auth
| Method | Endpoint | Notes |
|--------|----------|-------|
| POST | `/api/v1/auth/register` | Returns JWT |
| POST | `/api/v1/auth/login` | Returns JWT |
| POST | `/api/v1/auth/refresh` | Refresh token |

### Leads
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/v1/leads` | Paginated, sortable, filterable |
| POST | `/api/v1/leads` | Create single lead |
| POST | `/api/v1/leads/import` | CSV upload (multipart) |
| GET | `/api/v1/leads/{id}` | Single lead with research |
| GET | `/api/v1/leads/{id}/research` | Research data only |
| POST | `/api/v1/leads/research-all` | Trigger bulk research |

### Campaigns
| Method | Endpoint | Notes |
|--------|----------|-------|
| POST | `/api/v1/campaigns` | Create campaign |
| GET | `/api/v1/campaigns` | List campaigns |
| GET | `/api/v1/campaigns/{id}` | Single campaign + templates |
| PATCH | `/api/v1/campaigns/{id}` | Update (draft only) |
| POST | `/api/v1/campaigns/{id}/generate` | Start email generation |
| POST | `/api/v1/campaigns/{id}/launch` | Launch campaign |

### Emails
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/v1/campaigns/{id}/emails` | List emails (filterable by status) |
| PATCH | `/api/v1/campaigns/{id}/emails/{eid}` | Approve, edit |
| POST | `/api/v1/campaigns/{id}/emails/{eid}/regenerate` | Regenerate single |

### Analytics
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/v1/campaigns/{id}/analytics` | Metrics + chart data |
| WS | `/ws/campaigns/{id}/events` | Live event feed |

### Templates
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/api/v1/templates` | List all templates |
| POST | `/api/v1/templates` | Create template |
| PATCH | `/api/v1/templates/{id}` | Update template |

---

## Execution Timeline (Gantt)

```
Day  1  2  3  4  5  6  7  8  9  10  11  12  13  14  15  16  17
     ├──────┤                                                       Phase 1: AI Foundation
     │ 3.2  │ 3.1  │ 3.3 │                                         Schemas → Providers → SafeGen
              ├──────────────┤                                      Phase 2: Research Pipeline
              │ 4.1+4.2 │4.3│ 4.4 │                                Scraper+Signals → Prompts → Worker
                    ├────────────┤                                  Phase 3: Email AI
                    │ 5.3 │ 5.2  │                                  Email Prompts → Templates
                              ├──┤                                  Phase 4: Scaffold
                              │FE│                                  React project setup
                                 ├──────┤                           Phase 5: Lead Mgmt
                                 │ 2.4  │4.5│                      Lead Table → Research Panel
                                       ├──────────────┤            Phase 6: Campaign Flow
                                       │ 5.6      │5.7│            Wizard → Review Queue
                                                      ├──────┤     Phase 7: Dashboard
                                                      │7.3│7.4│   Dashboard → Timeline
```

**Total estimated hours: ~77 hours**

| Phase | Stories | Hours |
|-------|---------|-------|
| 1. AI Foundation | 3.2, 3.1, 3.3 | 11h |
| 2. Research Pipeline | 4.1, 4.2, 4.3, 4.4 | 13h |
| 3. Email AI Layer | 5.3, 5.2 | 5h |
| 4. Frontend Scaffold | Setup | 4h |
| 5. Lead Management | 2.4, 4.5 | 8h |
| 6. Campaign Flow | 5.6, 5.7 | 16h |
| 7. Dashboard | 7.3, 7.4 | 12h |
| **Buffer + Integration** | | **8h** |
| **Total** | | **77h** |

---

## Coordination Points with Developer A

| Dev B Needs | Dev A Provides | When |
|-------------|---------------|------|
| Celery config + Redis | Celery app setup, broker config | Before Phase 2 (Day 3) |
| DB models (Lead, Campaign, Email) | SQLAlchemy models + Alembic migrations | Before Phase 2 (Day 3) |
| REST API endpoints | FastAPI routers | Before Phase 5 (Day 8) |
| WebSocket endpoint | FastAPI WebSocket handler | Before Phase 7 (Day 14) |
| Auth middleware + JWT | Auth service + middleware | Before Phase 5 (Day 8) |
| Campaign status polling | Status field updates during generation | Before Phase 6 (Day 10) |

---

## Definition of Done (per story)

- [ ] All acceptance criteria from spec met
- [ ] Unit tests pass (`pytest -v` for backend, `npm test` for frontend)
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] No ESLint warnings
- [ ] Responsive on desktop (1280px+)
- [ ] Loading states for all async operations
- [ ] Error states with user-friendly messages
- [ ] Empty states where applicable
