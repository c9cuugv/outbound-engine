# OutboundEngine — Parallel Execution Plan

## How to Use This Document

This is your **single source of truth** while building. It tells you exactly what to work on, in what order, and when things merge. You never need to switch to the PRD during execution — every story here has its own self-contained instructions.

**Rules:**

- Check off tasks as you complete them: `[ ]` → `[x]`
- Each track has its own working branch: `track-a-data`, `track-b-ai`, `track-c-email`, `track-d-prompts`
- Merge points are where branches combine via PR
- Acceptance criteria are your "definition of done" — if all pass, the story is complete

---

## Progress Tracker

```
TRACK A: Data Layer        [__________] 0/7 stories
TRACK B: AI Schemas        [__________] 0/1 stories
TRACK C: Email Infra       [__________] 0/1 stories
TRACK D: Prompts           [__________] 0/2 stories
MERGE POINT 1              [__________] 0/4 stories
MERGE POINT 2              [__________] 0/5 stories
MERGE POINT 3              [__________] 0/4 stories
FRONTEND SPRINT            [__________] 0/6 stories
                           ─────────────────────────
TOTAL                                   0/28 stories
```

---

## Visual Map — Where You Are at Any Time

```
DAY 1-7 (all 4 tracks run simultaneously)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TRACK A              TRACK B         TRACK C          TRACK D
Data Layer           AI Schemas      Email Infra      Prompts
~25 hrs              ~3 hrs          ~3 hrs           ~5 hrs
branch:              branch:         branch:          branch:
track-a-data         track-b-ai      track-c-email    track-d-prompts

1.1 Monorepo         3.2 Pydantic    6.1 Email        4.3 Research
 ↓                   schemas +       provider +        prompts
1.2 Database         30+ tests       ConsoleProvider    ↓
 ↓                                                    5.3 Email gen
1.3 Auth                                              prompts
 ↓
1.4 Celery
 ↓
2.1 Lead CRUD
 ↓
2.2 CSV Import
 ↓
2.3 Lead Lists

━━━━━━━━ MERGE POINT 1 (all tracks → main) ━━━━━━━

DAY 8-10
3.1 Provider Interface + Factory
 ↓
3.3 Safe Generate with Retry
 ↓
┌─────────┴─────────┐
4.1 Scraper         4.2 Signals      ← parallel again
└─────────┬─────────┘

━━━━━━━━ MERGE POINT 2 ━━━━━━━━━━━━━━━━━━━━━━━━━

DAY 11-18 (sequential critical path, then split)
4.4 Research Worker
 ↓
5.1 Campaign CRUD + 5.2 Templates    ← parallel pair
 ↓
5.4 Email Generation Worker
 ↓
┌─────────┴─────────────┐
5.5 Review API          6.2 Tracking Injection    ← parallel
                         ↓
                        6.3 Tracking Endpoints
                         ↓
                        6.4 Event Processing
└─────────┬─────────────┘

━━━━━━━━ MERGE POINT 3 ━━━━━━━━━━━━━━━━━━━━━━━━━

DAY 19-22 (sequential then split)
6.5 Scheduler + Sender
 ↓
6.6 Reply Detection
 ↓
7.1 Analytics API + 7.2 WebSocket    ← parallel pair

━━━━━━━━ FRONTEND SPRINT (3 parallel tracks) ━━━━

DAY 23-30
UI-A                 UI-B                 UI-C
2.4 Lead Table       5.6 Campaign         7.3 Dashboard
 ↓                    Builder              ↓
4.5 Research          ↓                   7.4 Lead
 Panel               5.7 Review            Timeline
                      Queue
```

---

# TRACK A — Data Layer

**Branch:** `track-a-data`
**Duration:** ~25 hours
**Dependencies:** None — start immediately
**What this builds:** Project skeleton, database, auth, background jobs, all lead management

---

## [ ] A-1: Initialize Monorepo (STORY-1.1)

**Time:** ~3 hours
**Goal:** Docker Compose running with PostgreSQL + Redis, FastAPI health check, React hello world.

**Create these files:**

```
outbound-engine/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models/__init__.py
│   │   ├── schemas/__init__.py
│   │   ├── api/__init__.py
│   │   ├── api/v1/__init__.py
│   │   ├── services/__init__.py
│   │   ├── ai/__init__.py
│   │   ├── workers/__init__.py
│   │   └── utils/__init__.py
│   ├── alembic/
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── api/
│   │   └── App.jsx
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

**backend/app/main.py:**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="OutboundEngine", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}
```

**backend/app/config.py:**

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/outbound"
    REDIS_URL: str = "redis://localhost:6379/0"
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # AI Providers
    GEMINI_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    RESEARCH_PROVIDER: str = "gemini"
    EMAIL_GEN_PROVIDER: str = "gemini"
    SENTIMENT_PROVIDER: str = "gemini"

    # Email
    EMAIL_PROVIDER: str = "console"
    TRACKING_DOMAIN: str = ""

    # IMAP (reply detection)
    IMAP_HOST: str = ""
    IMAP_EMAIL: str = ""
    IMAP_PASSWORD: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
```

**docker-compose.yml:**

```yaml
version: '3.8'
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: outbound
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  pgdata:
```

**backend/requirements.txt:**

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
sqlalchemy[asyncio]==2.0.35
asyncpg==0.29.0
alembic==1.13.0
pydantic-settings==2.5.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
celery[redis]==5.4.0
redis==5.1.0
httpx==0.27.0
beautifulsoup4==4.12.3
python-multipart==0.0.9
```

**.env.example:**

```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/outbound
REDIS_URL=redis://localhost:6379/0
JWT_SECRET=change-me-in-production
GEMINI_API_KEY=
GROQ_API_KEY=
ANTHROPIC_API_KEY=
RESEARCH_PROVIDER=gemini
EMAIL_GEN_PROVIDER=gemini
SENTIMENT_PROVIDER=gemini
EMAIL_PROVIDER=console
TRACKING_DOMAIN=
IMAP_HOST=
IMAP_EMAIL=
IMAP_PASSWORD=
```

**Done when:**

- [ ] `docker-compose up -d` starts PostgreSQL on 5432, Redis on 6379
- [ ] `uvicorn app.main:app --reload` starts, `GET /health` returns `{"status": "ok"}`
- [ ] `cd frontend && npm run dev` renders "OutboundEngine" on localhost:3000
- [ ] `.gitignore` excludes: `node_modules/`, `__pycache__/`, `.env`, `*.pyc`, `venv/`

---

## [ ] A-2: Database Setup with Alembic (STORY-1.2)

**Time:** ~3 hours
**Goal:** Async SQLAlchemy + Alembic migrations creating leads tables.

**backend/app/database.py:**

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
```

**First migration must create these tables exactly:**

`leads` table:

```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
first_name      VARCHAR(100) NOT NULL
last_name       VARCHAR(100) NOT NULL
email           VARCHAR(255) NOT NULL UNIQUE
company_name    VARCHAR(255)
company_domain  VARCHAR(255)
title           VARCHAR(255)
linkedin_url    VARCHAR(500)
company_description    TEXT
company_industry       VARCHAR(100)
company_size           VARCHAR(50)
company_funding_stage  VARCHAR(50)
company_tech_stack     JSONB
recent_news            JSONB
pain_points            JSONB
status                 VARCHAR(20) DEFAULT 'new'
research_status        VARCHAR(20) DEFAULT 'pending'
research_completed_at  TIMESTAMPTZ
tags                   JSONB DEFAULT '[]'
custom_fields          JSONB DEFAULT '{}'
source                 VARCHAR(50)
created_at             TIMESTAMPTZ DEFAULT NOW()
updated_at             TIMESTAMPTZ DEFAULT NOW()

INDEXES: idx_leads_status, idx_leads_company_domain, idx_leads_research_status
```

`lead_lists` table:

```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
name             VARCHAR(255) NOT NULL
description      TEXT
filter_criteria  JSONB
is_dynamic       BOOLEAN DEFAULT false
created_at       TIMESTAMPTZ DEFAULT NOW()
```

`lead_list_members` table:

```sql
lead_list_id  UUID REFERENCES lead_lists(id) ON DELETE CASCADE
lead_id       UUID REFERENCES leads(id) ON DELETE CASCADE
added_at      TIMESTAMPTZ DEFAULT NOW()
PRIMARY KEY (lead_list_id, lead_id)
```

**Done when:**

- [ ] `alembic upgrade head` creates all 3 tables
- [ ] `alembic downgrade -1` drops them
- [ ] All column names, types, defaults, indexes match the spec above
- [ ] `get_db` yields async sessions correctly (test with a simple query)

---

## [ ] A-3: Authentication System (STORY-1.3)

**Time:** ~3 hours
**Goal:** JWT register/login/refresh working.

**Create `users` table via new migration:**

```sql
id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
email          VARCHAR(255) NOT NULL UNIQUE
name           VARCHAR(100) NOT NULL
password_hash  VARCHAR(255) NOT NULL
created_at     TIMESTAMPTZ DEFAULT NOW()
```

**Endpoints:**

| Method | Path                      | Input                       | Output                            |
| ------ | ------------------------- | --------------------------- | --------------------------------- |
| POST   | `/api/v1/auth/register` | `{email, password, name}` | `{access_token, refresh_token}` |
| POST   | `/api/v1/auth/login`    | `{email, password}`       | `{access_token, refresh_token}` |
| POST   | `/api/v1/auth/refresh`  | `{refresh_token}`         | `{access_token}`                |

**Auth dependency for protected routes:**

```python
# Extracts user from Bearer token, raises 401 if invalid/expired
async def get_current_user(token: str = Depends(oauth2_scheme), db = Depends(get_db)) -> User:
    ...
```

**Done when:**

- [ ] Passwords hashed with bcrypt (never plaintext in DB)
- [ ] Access token expires in 30 min
- [ ] Refresh token expires in 7 days
- [ ] `POST /api/v1/auth/register` with duplicate email → 409
- [ ] Any protected route without Bearer token → 401
- [ ] Any protected route with expired token → 401

---

## [ ] A-4: Celery Worker Setup (STORY-1.4)

**Time:** ~3 hours
**Goal:** Celery worker + beat running in Docker Compose.

**backend/app/workers/celery_app.py:**

```python
from celery import Celery
from app.config import settings

celery_app = Celery(
    'outbound_engine',
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    beat_schedule={},  # populated later by other stories
)
```

**Test task in `backend/app/workers/tasks.py`:**

```python
from app.workers.celery_app import celery_app

@celery_app.task
def add(x, y):
    return x + y
```

**Add to docker-compose.yml:**

```yaml
  api:
    build: ./backend
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    ports:
      - "8000:8000"
    env_file: .env
    depends_on:
      - db
      - redis

  worker:
    build: ./backend
    command: celery -A app.workers.celery_app worker --loglevel=info
    env_file: .env
    depends_on:
      - db
      - redis

  beat:
    build: ./backend
    command: celery -A app.workers.celery_app beat --loglevel=info
    env_file: .env
    depends_on:
      - redis
```

**Done when:**

- [ ] `docker-compose up` starts 5 services: api, worker, beat, db, redis
- [ ] From a Python shell: `add.delay(2, 3).get(timeout=10)` returns `5`
- [ ] `docker-compose logs worker` shows task execution

---

## [ ] A-5: Lead CRUD API (STORY-2.1)

**Time:** ~5 hours
**Goal:** Full CRUD for leads with pagination, sorting, filtering.

**Endpoints:**

| Method | Path                   | Notes                                                                                                                   |
| ------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/leads`      | Create single lead. Duplicate email → 409.                                                                             |
| GET    | `/api/v1/leads`      | Paginated list. Params:`page`, `per_page`, `sort`, `order`, `status`, `research_status`, `company_domain` |
| GET    | `/api/v1/leads/{id}` | Single lead with all fields                                                                                             |
| PATCH  | `/api/v1/leads/{id}` | Partial update (only provided fields)                                                                                   |
| DELETE | `/api/v1/leads/{id}` | Soft delete: sets `status='deleted'`                                                                                  |

**Pagination response format:**

```json
{
  "items": [...],
  "total_count": 150,
  "page": 1,
  "per_page": 50,
  "total_pages": 3
}
```

**Done when:**

- [ ] All 5 endpoints work with valid JWT
- [ ] Duplicate email on create → `409 {"detail": "Lead with this email already exists"}`
- [ ] Pagination math is correct (150 items, per_page 50 = 3 pages)
- [ ] Multiple filters combine with AND: `?status=new&company_domain=acme.com`
- [ ] Sorting works: `?sort=created_at&order=desc`
- [ ] All endpoints return 401 without valid Bearer token
- [ ] `GET /api/v1/leads` responds < 200ms with 1000 leads in DB

---

## [ ] A-6: CSV Lead Import (STORY-2.2)

**Time:** ~5 hours
**Goal:** Bulk import leads from CSV with validation.

**Endpoint:** `POST /api/v1/leads/bulk` (multipart file upload)

**CSV columns:** `first_name`, `last_name`, `email`, `company_name`, `company_domain`, `title`, `linkedin_url`

**Validation pipeline (per row):**

1. Required fields present: `email`, `first_name`, `last_name` → skip row if missing
2. Email format: regex `^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`
3. Reject role-based: `info@`, `support@`, `sales@`, `admin@`, `contact@`, `help@`
4. MX record check: async DNS lookup with 3s timeout, cache results per domain
5. Dedup: check against ALL existing leads in DB by email

**Response:**

```json
{
  "imported": 87,
  "skipped_duplicate": 5,
  "skipped_invalid": 8,
  "errors": [
    {"row": 3, "email": "bad-email", "reason": "invalid email format"},
    {"row": 7, "email": "info@acme.com", "reason": "role-based email rejected"},
    {"row": 12, "email": "test@fake.xyz", "reason": "MX record not found"}
  ]
}
```

**Done when:**

- [ ] Upload 100-row CSV → correct import/skip/error counts
- [ ] Role-based emails rejected with clear reason
- [ ] Duplicate emails (against existing DB) skipped with count
- [ ] MX check times out gracefully at 3s (doesn't block entire import)
- [ ] MX results cached per domain (don't check same domain twice)
- [ ] 10,000-row CSV processes without HTTP timeout
- [ ] Missing `linkedin_url` → null (not error)
- [ ] Missing `email` → row skipped with error

---

## [ ] A-7: Lead Lists (STORY-2.3)

**Time:** ~3 hours
**Goal:** Static and dynamic list management.

**Endpoints:**

| Method | Path                         | Notes                                                |
| ------ | ---------------------------- | ---------------------------------------------------- |
| POST   | `/api/v1/lists`            | `{name, description, is_dynamic, filter_criteria}` |
| GET    | `/api/v1/lists`            | All lists with member count                          |
| GET    | `/api/v1/lists/{id}`       | List detail + members (evaluates filter if dynamic)  |
| POST   | `/api/v1/lists/{id}/leads` | `{lead_ids: [...]}` — add to static list          |
| DELETE | `/api/v1/lists/{id}/leads` | `{lead_ids: [...]}` — remove from static list     |

**Dynamic list example filter_criteria:**

```json
{
  "status": ["new", "researched"],
  "company_size": ["11-50", "51-200"],
  "research_status": "completed"
}
```

**Done when:**

- [ ] Static list: add/remove leads works
- [ ] Dynamic list with filter returns only matching leads at query time
- [ ] Adding leads to dynamic list → `400 {"detail": "Cannot manually add to dynamic list"}`
- [ ] Member count computed in single SQL query (not N+1)
- [ ] List index shows count next to each list name

---

### ✅ TRACK A COMPLETE — Merge `track-a-data` into `main`

---

# TRACK B — AI Schemas

**Branch:** `track-b-ai`
**Duration:** ~3 hours
**Dependencies:** None — start immediately
**What this builds:** Pydantic validation schemas that every LLM output must pass through

---

## [ ] B-1: Pydantic Output Schemas (STORY-3.2)

**Time:** ~3 hours
**Goal:** Three bulletproof schemas with extensive tests.

**Create `backend/app/ai/schemas.py`:**

### ResearchOutput schema:

```python
class ResearchOutput(BaseModel):
    company_summary: str = Field(max_length=500)
    industry: str
    company_size_estimate: str = Field(
        pattern=r'^(1-10|11-50|51-200|201-1000|1000\+|unknown)$'
    )
    tech_stack_signals: list[str] = Field(max_length=20)
    potential_pain_points: list[str] = Field(min_length=1, max_length=5)
    personalization_hooks: list[str] = Field(min_length=1, max_length=5)
    confidence_score: float = Field(ge=0.0, le=1.0)
```

**Hallucination validator on `company_summary`** — REJECT if contains:

- "founded in" (often hallucinated founding dates)
- "revenue of" (fabricated revenue)
- "million users" (made-up user counts)
- "raised $" (invented funding amounts)
- "valued at" (hallucinated valuations)
- "according to" (fake citations)

### EmailOutput schema:

```python
class EmailOutput(BaseModel):
    subject_options: list[str] = Field(min_length=1, max_length=3)
    body: str = Field(min_length=50, max_length=2000)
```

**Validators:**

- `body` must NOT contain: `{first_name}`, `{company}`, `[INSERT`, `[YOUR`, `{{`, `}}`, `<PLACEHOLDER`
- `subject_options` each must be 2-10 words

### SentimentOutput schema:

```python
class SentimentOutput(BaseModel):
    sentiment: str = Field(
        pattern=r'^(interested|not_interested|out_of_office|unsubscribe|question)$'
    )
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str = Field(max_length=200)
```

### Tests — write ALL of these:

**ResearchOutput tests (10+):**

- [ ] Valid complete object → passes
- [ ] `company_summary` containing "founded in 2019" → ValidationError
- [ ] `company_summary` containing "revenue of $50M" → ValidationError
- [ ] `company_summary` containing "raised $10M" → ValidationError
- [ ] `company_summary` containing "million users" → ValidationError
- [ ] `company_summary` containing "valued at" → ValidationError
- [ ] `company_summary` containing "according to" → ValidationError
- [ ] `company_size_estimate` = "big" → ValidationError
- [ ] `company_size_estimate` = "51-200" → passes
- [ ] `company_size_estimate` = "unknown" → passes
- [ ] `confidence_score` = 1.5 → ValidationError
- [ ] `confidence_score` = -0.1 → ValidationError
- [ ] Empty `potential_pain_points` → ValidationError
- [ ] 6 items in `personalization_hooks` → ValidationError

**EmailOutput tests (10+):**

- [ ] Valid email → passes
- [ ] Body containing `{first_name}` → ValidationError
- [ ] Body containing `[INSERT YOUR CTA]` → ValidationError
- [ ] Body containing `{{variable}}` → ValidationError
- [ ] Body with 30 chars → ValidationError (min 50)
- [ ] Body with 2500 chars → ValidationError (max 2000)
- [ ] Subject with 1 word → ValidationError (min 2)
- [ ] Subject with 12 words → ValidationError (max 10)
- [ ] Subject with 5 words → passes
- [ ] Empty subject_options list → ValidationError

**SentimentOutput tests (5+):**

- [ ] Valid → passes
- [ ] `sentiment` = "maybe" → ValidationError
- [ ] `sentiment` = "interested" → passes
- [ ] `confidence` = 2.0 → ValidationError
- [ ] `reasoning` over 200 chars → ValidationError

**Done when:**

- [ ] All 25+ tests pass
- [ ] `pytest tests/test_schemas.py -v` shows all green
- [ ] Every hallucination pattern from the list is caught

---

### ✅ TRACK B COMPLETE — Merge `track-b-ai` into `main`

---

# TRACK C — Email Infrastructure

**Branch:** `track-c-email`
**Duration:** ~3 hours
**Dependencies:** None — start immediately
**What this builds:** Abstracted email sending with dev-friendly console output

---

## [ ] C-1: Email Provider Integration (STORY-6.1)

**Time:** ~3 hours
**Goal:** Email provider abstraction with 3 implementations.

**Create `backend/app/services/email_provider.py`:**

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass

@dataclass
class SendResult:
    success: bool
    message_id: str = ""
    error: str = ""

class HardBounceError(Exception):
    pass

class SoftBounceError(Exception):
    pass

class EmailProvider(ABC):
    @abstractmethod
    async def send(
        self,
        from_email: str,
        from_name: str,
        to_email: str,
        subject: str,
        html_body: str,
        reply_to: str = None,
        headers: dict = None
    ) -> SendResult:
        pass
```

**Implement 3 providers:**

### ConsoleProvider (default, for development):

- Prints email details to stdout in readable format
- Always returns `SendResult(success=True, message_id="console-{uuid}")`
- Requires NO API key

### ResendProvider:

- Uses `resend` Python SDK
- Maps Resend errors to `HardBounceError` / `SoftBounceError`
- Returns `SendResult` with Resend's message ID

### SendGridProvider:

- Uses `sendgrid` Python SDK
- Same error mapping
- Returns `SendResult` with SendGrid's message ID

**Always include `List-Unsubscribe` in headers (all providers).**

**Factory function:**

```python
def get_email_provider() -> EmailProvider:
    provider = settings.EMAIL_PROVIDER  # "console", "resend", "sendgrid"
    ...
```

**Done when:**

- [ ] `ConsoleProvider` works with zero config — prints formatted email to stdout
- [ ] `ResendProvider` sends real email when `RESEND_API_KEY` is set
- [ ] `SendGridProvider` sends real email when `SENDGRID_API_KEY` is set
- [ ] All providers include `List-Unsubscribe` header
- [ ] `HardBounceError` and `SoftBounceError` are distinct exception types
- [ ] Factory defaults to `"console"` when `EMAIL_PROVIDER` not set

---

### ✅ TRACK C COMPLETE — Merge `track-c-email` into `main`

---

# TRACK D — Prompts

**Branch:** `track-d-prompts`
**Duration:** ~5 hours
**Dependencies:** None — start immediately
**What this builds:** All AI prompt templates (pure text, no LLM calls)

---

## [ ] D-1: Research Synthesis Prompts (STORY-4.3)

**Time:** ~2 hours
**Goal:** System prompt + builder function for research synthesis.

**Create `backend/app/ai/prompts/research.py`:**

**`RESEARCH_SYSTEM_PROMPT`** — must include these exact instructions:

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

**`build_research_prompt(lead: dict, scraped_data: dict, signals: dict) -> str`:**

- Inserts lead info: `{first_name} {last_name}, {title} at {company_name} ({company_domain})`
- Wraps scraped data in `--- VERIFIED DATA ---` / `--- END DATA ---` markers
- Includes signal data (tech stack, hiring) if available
- Requests JSON response matching `ResearchOutput` schema
- **Truncates total content to 4000 characters** if scraped data is too long (for free tier token limits)

**Test by manually pasting output into Gemini/Claude:**

- [ ] Generate prompt for a real company (e.g., scrape stripe.com)
- [ ] Paste into AI chat — verify output matches `ResearchOutput` schema
- [ ] Verify AI does NOT invent facts not in the scraped text

**Done when:**

- [ ] System prompt contains exact anti-hallucination instructions above
- [ ] `build_research_prompt` returns a string
- [ ] Data is clearly wrapped in markers
- [ ] Total output never exceeds 4000 characters
- [ ] Function does NOT call any LLM (pure string building)

---

## [ ] D-2: Email Generation Prompts (STORY-5.3)

**Time:** ~3 hours
**Goal:** System prompt + builder function for personalized email generation.

**Create `backend/app/ai/prompts/email_gen.py`:**

**`build_system_prompt(campaign: dict) -> str`:**
Includes:

```
You are a sales copywriter for {product_name}.

Product: {product_description}
Target ICP: {icp_description}
Value proposition: {value_prop}

RULES:
- Maximum {max_word_count} words
- NEVER use these words: "synergy", "leverage", "cutting-edge", "game-changer",
  "circle back", "touch base", "move the needle", "ecosystem", "holistic"
- NEVER use fake urgency: "limited time", "act now", "don't miss out"
- NEVER start with "I hope this email finds you well"
- NEVER start with "I came across your company"
- Sound like a real human, not a marketing bot
- One clear CTA per email
- Paragraphs: 2-3 sentences max
- Use the prospect's first name naturally (not in every sentence)
- Reference specific details from the research — generic flattery is worse than nothing
```

**`build_email_prompt(template: dict, lead: dict, research: dict, previous_context: dict = None) -> str`:**

For **Step 1** (initial outreach):

```
Write a cold email to {first_name} {last_name}, {title} at {company_name}.

RESEARCH (use this for personalization):
- Company does: {company_summary}
- Personalization hooks: {personalization_hooks}
- Pain points: {potential_pain_points}
- Recent developments: {recent_developments}

This is the FIRST email. Goals:
1. Open with something specific about their company (NOT generic flattery)
2. Connect their situation to a problem we solve
3. End with a soft CTA — suggest a quick call, not "buy now"

Subject line: Write 3 options. Under 6 words each. No clickbait.

Respond with JSON: {"subject_options": [...], "body": "..."}
```

For **Step 2+** (follow-ups) — adds:

```
PREVIOUS EMAIL CONTEXT:
- Subject used: {previous_subject}
- Key point made: {previous_body_summary}

This is follow-up #{sequence_position}. No reply received.

RULES FOR FOLLOW-UPS:
- Do NOT just say "following up on my last email"
- Add NEW value: a relevant insight, case study stat, or different angle
- Keep shorter than the previous email (max 80 words)
- Different CTA angle than previous
```

**Total prompt must be under 3000 characters** (free tier limits).

**Test by manually pasting into Gemini/Claude:**

- [ ] Generate step 1 prompt with real research data → verify natural email output
- [ ] Generate step 2 prompt with previous context → verify it adds new value
- [ ] Verify output parses as valid `EmailOutput` schema

**Done when:**

- [ ] System prompt contains exact anti-buzzword list
- [ ] System prompt contains "Never start with" rules
- [ ] Step 1 prompt does NOT receive `previous_context`
- [ ] Step 2+ prompt includes previous email context
- [ ] Total prompt under 3000 chars
- [ ] Functions return strings only (no LLM calls)

---

### ✅ TRACK D COMPLETE — Merge `track-d-prompts` into `main`

---

# MERGE POINT 1

**When:** All 4 tracks complete
**Action:** Merge all branches into `main`. Resolve any conflicts (there shouldn't be any — tracks touch different files).

**Then build these stories sequentially on `main`:**

---

## [ ] M1-1: Provider Interface and Factory (STORY-3.1)

**Time:** ~5 hours
**Goal:** Wire up the LLM provider abstraction so the app can call any AI provider.

**Create `backend/app/ai/providers.py`** with 4 provider classes:

- `GeminiProvider` — uses `google-generativeai` SDK
- `GroqProvider` — uses `groq` SDK
- `ClaudeCodeProvider` — uses `subprocess` to call `claude` CLI
- `AnthropicAPIProvider` — uses `anthropic` SDK

**Create `backend/app/ai/factory.py`:**

```python
def get_provider(task: str) -> AIProvider:
    # Reads {task}_PROVIDER from settings
    # Returns configured provider instance
    # Defaults to "gemini"
    # Raises ConfigError if required API key missing
```

**Install new deps:** `pip install google-generativeai groq anthropic`

**Done when:**

- [ ] `get_provider("research")` returns GeminiProvider (when RESEARCH_PROVIDER=gemini)
- [ ] Missing API key → `ConfigError("GEMINI_API_KEY required for gemini provider")`
- [ ] Default provider is gemini when env var not set
- [ ] Test: `await GeminiProvider(key).generate("system", "Say hello")` returns a string
- [ ] Test: `await provider.generate_json("system", "Return {\"ok\": true}")` parses correctly

---

## [ ] M1-2: Safe Generate with Retry (STORY-3.3)

**Time:** ~3 hours
**Goal:** The ONE function the entire app uses to call LLMs.

**Create `backend/app/ai/safe_generate.py`** and `backend/app/ai/exceptions.py`

Implements the retry loop:

1. Build prompt with schema instructions appended
2. Call `provider.generate()`
3. Parse JSON from response (strip markdown fences)
4. Validate with Pydantic schema
5. On JSON error → retry with error message in prompt
6. On validation error → retry with specific error in prompt
7. After `max_retries` → raise `GenerationError`

**Done when:**

- [ ] Mock provider returning valid JSON → returns validated model on attempt 1
- [ ] Mock provider returning `"```json\n{...}\n```"` → strips fences, parses correctly
- [ ] Mock provider returning bad JSON on try 1, valid on try 2 → succeeds on attempt 2
- [ ] Mock provider returning schema-invalid JSON on all tries → raises `GenerationError`
- [ ] Retry prompt includes the ORIGINAL user prompt (doesn't lose context)
- [ ] Test: `safe_generate(mock, "sys", "user", ResearchOutput)` returns `ResearchOutput` instance

---

## [ ] M1-3: Company Website Scraper (STORY-4.1)

**Time:** ~3 hours (can run parallel with M1-4)

**Create `backend/app/services/scraper.py`:**

```python
class CompanyScraper:
    PAGES = ['/', '/about', '/about-us', '/company', '/blog', '/careers', '/pricing']

    async def scrape_company(self, domain: str) -> dict:
        # Returns {"/" : "homepage text...", "/about": "about text...", ...}
```

**Done when:**

- [ ] `scrape_company("stripe.com")` returns dict with at least `/` key
- [ ] Text has no `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>` content
- [ ] Each page truncated to 2000 chars
- [ ] Unreachable domain → returns `{}` (no exception)
- [ ] Tries HTTPS first, falls back to HTTP
- [ ] Timeout is 10 seconds per page
- [ ] User-Agent set to `"OutboundEngine/1.0 (research bot)"`

---

## [ ] M1-4: Signal Collector (STORY-4.2)

**Time:** ~3 hours (can run parallel with M1-3)

**Create `backend/app/services/signals.py`:**

**Tech detection** — scan homepage HTML for:

- `<meta name="generator">` values
- Script patterns: `react`, `angular`, `vue`, `jquery`, `stripe.js`, `segment`, `hubspot`, `intercom`, `gtag`/`google-analytics`
- Meta/link patterns: `shopify`, `wordpress`, `webflow`, `squarespace`, `wix`

**Hiring signals** — check these URLs for 200 response:

- `https://{domain}.greenhouse.io/jobs`
- `https://jobs.lever.co/{domain}`
- 5-second timeout each

**Done when:**

- [ ] `get_tech_signals("stripe.com")` returns list including recognized technologies
- [ ] Domain with no detectable tech → returns `[]` (not null, not error)
- [ ] Hiring check timeout → returns `None` (not error)
- [ ] All HTTP errors caught and logged, never bubble up

---

### ✅ MERGE POINT 1 COMPLETE

---

# MERGE POINT 2

**Build these sequentially — this is the critical path where everything connects.**

---

## [ ] M2-1: Research Worker (STORY-4.4)

**Time:** ~5 hours
**Goal:** Celery task that runs: scrape → signals → AI synthesis → store on lead.

**Create `backend/app/workers/research_tasks.py`:**

Two tasks:

1. `research_lead(lead_id)` — single lead
2. `research_lead_list(lead_list_id)` — dispatches individual tasks for each pending lead

**Pipeline for `research_lead`:**

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

**Done when:**

- [ ] Rate limited to `10/m`
- [ ] Retries: 3 with backoff (60s, 120s, 180s)
- [ ] Empty scrape → `failed` + note, NO LLM call made
- [ ] LLM failure (GenerationError) → `failed` + note
- [ ] Low confidence → `needs_review`
- [ ] Success → research fields populated on lead record
- [ ] `research_lead_list` dispatches one task per pending lead

---

## [ ] M2-2: Campaign CRUD + Templates (STORY-5.1 + STORY-5.2)

**Time:** ~6 hours (these are tightly related, build together)

**New migration for `campaigns` table:**

```sql
id, name, product_name, product_description, icp_description, value_prop,
system_prompt, sender_email, sender_name, reply_to_email,
sending_timezone, sending_days (JSONB), sending_window_start (TIME),
sending_window_end (TIME), max_emails_per_day, min_delay_between_emails_seconds,
ab_test_enabled, ab_split_percentage, status (default 'draft'),
total_leads, emails_sent, emails_opened, emails_clicked, emails_replied,
emails_bounced, created_at, updated_at
```

**New migration for `email_templates` table:**

```sql
id, name, system_prompt, generation_prompt, max_word_count (default 120),
tone (default 'professional-casual'), sequence_position, days_delay,
created_at, updated_at
```

**Campaign endpoints:** POST, GET (list), GET (single), PATCH
**Template endpoints:** POST, GET (list), PATCH

**Seed 3 templates** (via seed script, not migration):

1. "Initial Outreach" — position 1, day 0
2. "Value Follow-up" — position 2, day 3
3. "Breakup Email" — position 3, day 7

**Done when:**

- [ ] New campaign starts in `draft` status
- [ ] Cannot PATCH campaign in `active` status → 400
- [ ] Templates ordered by `sequence_position`
- [ ] 3 seed templates exist after running seed script
- [ ] Campaign stats all default to 0

---

## [ ] M2-3: Email Generation Worker (STORY-5.4)

**Time:** ~8 hours
**Goal:** Generate personalized emails for an entire campaign.

**New migration for `generated_emails` table:**

```sql
id, lead_id (FK), campaign_id (FK), template_id (FK),
sequence_position, subject, subject_alternatives (JSONB), body,
body_original, was_manually_edited (default false),
status (default 'draft'), scheduled_at, sent_at,
opened_at, opened_count (default 0), clicked_at, clicked_count (default 0),
replied_at, bounced_at, bounce_type, variant_group,
created_at, updated_at
```

**Celery task `generate_campaign_emails(campaign_id)`:**

```
1. Set campaign.status = 'generating'
2. Get all leads attached to campaign
3. For each lead WHERE research_status = 'completed':
   a. For each template (ordered by sequence_position):
      - Build system prompt from campaign
      - Build email prompt from template + lead + research + previous context
      - Call safe_generate with EmailOutput schema
      - Store as generated_email with status='draft'
      - Pass context forward for next step
   b. On failure for one lead: log error, continue to next
4. Set campaign.status = 'review'
```

**Done when:**

- [ ] Rate limited to 15/min
- [ ] `body_original` stored alongside `body` (identical on creation)
- [ ] Leads without `research_status='completed'` skipped with log warning
- [ ] One lead failing doesn't stop the campaign
- [ ] 3 leads × 3 templates = 9 `generated_emails` rows
- [ ] Campaign moves to `review` after all leads processed

---

## [ ] M2-4: Email Review API (STORY-5.5)

**Time:** ~5 hours (can run parallel with M2-5)

**Endpoints:**

| Method | Path                                               | Action                              |
| ------ | -------------------------------------------------- | ----------------------------------- |
| GET    | `/api/v1/campaigns/{id}/emails`                  | List all, grouped by lead then step |
| GET    | `/api/v1/campaigns/{id}/emails/{eid}`            | Single email + lead + research      |
| PATCH  | `/api/v1/campaigns/{id}/emails/{eid}`            | Edit subject/body                   |
| POST   | `/api/v1/campaigns/{id}/emails/{eid}/approve`    | Set status → approved              |
| POST   | `/api/v1/campaigns/{id}/emails/approve-all`      | Bulk approve all drafts             |
| POST   | `/api/v1/campaigns/{id}/emails/{eid}/regenerate` | Re-run AI generation                |

**Done when:**

- [ ] Only `draft` emails can be approved
- [ ] Edit sets `was_manually_edited=true`, preserves `body_original`
- [ ] Regenerate replaces content, keeps lead_id/template_id/position
- [ ] Bulk approve returns `{approved: N, skipped: M}`

---

## [ ] M2-5: Tracking System (STORY-6.2 + STORY-6.3 + STORY-6.4)

**Time:** ~8 hours (can run parallel with M2-4)
**Build these 3 stories together — they're tightly coupled.**

**STORY-6.2 — Tracking Injection:**

- `inject_tracking(html_body, email_id)` function
- Appends 1x1 pixel `<img>` before `</body>`
- Rewrites `<a href>` links → `https://{TRACKING_DOMAIN}/t/c/{email_id}/{link_hash}`
- Appends unsubscribe link
- Stores original URLs in Redis: `link:{hash}` with 90-day TTL
- Skip entirely if `TRACKING_DOMAIN` not configured

**STORY-6.3 — Tracking Endpoints:**

- `GET /t/o/{email_id}.png` → transparent pixel + publish event
- `GET /t/c/{email_id}/{link_hash}` → 302 redirect + publish event
- `GET /t/u/{email_id}` → unsubscribe handler
- New `tracking_events` table

**STORY-6.4 — Event Processing:**

- Celery task consuming from Redis pub/sub
- Updates `opened_at`/`clicked_at` on first occurrence
- Increments counts on subsequent
- Stores raw events in `tracking_events`

**Done when:**

- [ ] Pixel returns valid PNG, < 50ms
- [ ] Links redirect correctly; unknown hash → 404
- [ ] Unsubscribe updates lead + cancels pending emails
- [ ] First open sets `opened_at` AND increments campaign stat
- [ ] Second open only increments `opened_count`
- [ ] Same logic for clicks
- [ ] No auth required on tracking endpoints

---

### ✅ MERGE POINT 2 COMPLETE

---

# MERGE POINT 3

**Sequential — these depend on everything above.**

---

## [ ] M3-1: Scheduler and Send Worker (STORY-6.5)

**Time:** ~8 hours

**Implements:**

- `schedule_campaign_emails(campaign_id)` — calculates send times
- `process_scheduled_emails()` — Celery Beat every 60s
- `send_email(email_id)` — sends with tracking injection
- `cancel_remaining_sequence(lead_id, campaign_id)`

**Scheduling rules:**

- Respect campaign timezone, sending days, sending window
- Daily limit: spread emails across the window
- Jitter: ±15 min random on each send time
- Rate: 1 email per second max

**Send rules:**

- Skip if lead replied/unsubscribed/bounced since scheduling
- Hard bounce → status `bounced`, lead `bounced`, cancel sequence
- Soft bounce → retry in 1hr, 3 max, then bounce

**Done when:**

- [ ] Emails only scheduled within window (e.g., 9am-5pm)
- [ ] Emails only on configured days
- [ ] Daily limit respected
- [ ] Jitter applied
- [ ] Replied/unsubscribed leads skipped
- [ ] Bounce handling correct

---

## [ ] M3-2: Reply Detection (STORY-6.6)

**Time:** ~5 hours

**Celery Beat task every 5 minutes:**

1. Connect IMAP
2. Check for new emails since last check
3. Match to campaign emails (In-Reply-To header, then subject matching)
4. On match: update email status → `replied`, cancel sequence, classify sentiment

**Done when:**

- [ ] IMAP not configured → feature disabled (no error)
- [ ] Reply matched → sequence cancelled within 60s
- [ ] Sentiment classified via `safe_generate` + `SentimentOutput`
- [ ] Reply stored in `replies` table

---

## [ ] M3-3: Analytics API (STORY-7.1)

**Time:** ~5 hours (can run parallel with M3-4)

**Done when:**

- [ ] Rates = count / emails_sent; div by zero → 0.0
- [ ] `by_day` includes zero-send days
- [ ] `top_subjects` min 10 sends
- [ ] Timeline chronological with all event types
- [ ] < 500ms for 1000-lead campaign

---

## [ ] M3-4: WebSocket Live Feed (STORY-7.2)

**Time:** ~3 hours (can run parallel with M3-3)

**Done when:**

- [ ] Auth via `?token={jwt}` query param
- [ ] Events within 2s of occurrence
- [ ] Multiple clients subscribe to same campaign
- [ ] Disconnected clients cleaned up

---

### ✅ MERGE POINT 3 COMPLETE — Backend 100% done

---

# FRONTEND SPRINT

**3 parallel tracks. All backend APIs are done. These are pure React.**

---

## [ ] UI-A: Lead Management (STORY-2.4 + STORY-4.5)

**Time:** ~8 hours

**STORY-2.4 — Lead Table (`/leads`):**

- Sortable table: Name, Email, Company, Title, Status, Research Status, Created
- Filter dropdowns for Status and Research Status
- Search box (name/email/company)
- Pagination controls
- "Upload CSV" button → file picker → import summary modal
- Status badges: pending (gray), in_progress (yellow), completed (green), failed (red), needs_review (orange)
- Empty state: "No leads yet. Upload a CSV to get started."

**STORY-4.5 — Research Panel:**

- "Research All" button → triggers research, polls every 5s
- Expandable row per lead showing research:
  - Company summary, industry, size, tech stack (as tags)
  - Pain points, personalization hooks (lists)
  - Confidence % with color: green > 80%, yellow 60-80%, red < 60%
  - "needs_review" → orange warning banner

---

## [ ] UI-B: Campaign Flow (STORY-5.6 + STORY-5.7)

**Time:** ~16 hours

**STORY-5.6 — Campaign Builder (`/campaigns/new`):**
4-step wizard:

1. Product Info: name, description, ICP, value prop (text inputs)
2. Select Leads: pick from lists or upload CSV, shows count
3. Sequence Config: template cards (Email 1 → 2 → 3) with day delays
4. Sending Settings: timezone, days, window, max/day

"Generate Emails" button → polls campaign status every 5s → redirects to review

**STORY-5.7 — Review Queue (`/campaigns/{id}/review`):**

- Stats bar: drafts / approved / failed
- Email cards grouped by lead
- Expand card: editable subject + body
- Side panel: research data (cross-reference for user)
- Per-email: Approve / Edit / Regenerate buttons
- "Approve All" bulk button
- "Launch Campaign" appears when ≥1 approved

---

## [ ] UI-C: Dashboard (STORY-7.3 + STORY-7.4)

**Time:** ~12 hours

**STORY-7.3 — Campaign Dashboard (`/campaigns/{id}/dashboard`):**

- Status badge + pause/resume button
- 4 metric cards: Sent, Opened %, Clicked %, Replied %
- Line chart: daily sends + rate overlay (Recharts)
- Bar chart: performance by sequence step
- Live activity feed via WebSocket (scrolling list)
- Sentiment pie chart

**STORY-7.4 — Lead Timeline (`/campaigns/{id}/leads/{lead_id}`):**

- Lead info header
- Collapsible research summary
- Chronological timeline with icons: 📧 sent, 👁 opened, 🔗 clicked, 💬 replied
- Relative time ("2 hours ago") + absolute on hover
- Reply preview (200 char truncate + expand)

---

### ✅ FRONTEND SPRINT COMPLETE

---

# Final Checklist Before Demo

- [ ] All 28 stories complete
- [ ] `docker-compose up` starts entire stack
- [ ] Can upload CSV → research → generate → review → launch → track
- [ ] Dashboard shows live events via WebSocket
- [ ] README.md has setup instructions, screenshots, architecture diagram
- [ ] `.env.example` is complete and documented
- [ ] Code pushed to GitHub with descriptive commit history
- [ ] Demo video recorded (2-3 min walkthrough)

---

# Quick Reference — What Touches What

| File/Folder                                | Modified By                      |
| ------------------------------------------ | -------------------------------- |
| `docker-compose.yml`                     | A-1, A-4                         |
| `backend/app/config.py`                  | A-1                              |
| `backend/app/database.py`                | A-2                              |
| `backend/app/models/`                    | A-2, A-3, M2-2, M2-3, M2-5, M3-2 |
| `backend/app/api/v1/auth.py`             | A-3                              |
| `backend/app/api/v1/leads.py`            | A-5, A-6, A-7                    |
| `backend/app/api/v1/campaigns.py`        | M2-2, M2-4                       |
| `backend/app/api/v1/analytics.py`        | M3-3                             |
| `backend/app/api/v1/tracking.py`         | M2-5                             |
| `backend/app/ai/schemas.py`              | B-1                              |
| `backend/app/ai/providers.py`            | M1-1                             |
| `backend/app/ai/factory.py`              | M1-1                             |
| `backend/app/ai/safe_generate.py`        | M1-2                             |
| `backend/app/ai/prompts/research.py`     | D-1                              |
| `backend/app/ai/prompts/email_gen.py`    | D-2                              |
| `backend/app/services/scraper.py`        | M1-3                             |
| `backend/app/services/signals.py`        | M1-4                             |
| `backend/app/services/email_provider.py` | C-1                              |
| `backend/app/services/tracking.py`       | M2-5                             |
| `backend/app/workers/celery_app.py`      | A-4                              |
| `backend/app/workers/research_tasks.py`  | M2-1                             |
| `backend/app/workers/email_gen_tasks.py` | M2-3                             |
| `backend/app/workers/send_tasks.py`      | M3-1                             |
| `backend/app/workers/reply_tasks.py`     | M3-2                             |
| `backend/app/workers/tracking_tasks.py`  | M2-5                             |
| `frontend/src/pages/Leads.jsx`           | UI-A                             |
| `frontend/src/pages/CampaignBuilder.jsx` | UI-B                             |
| `frontend/src/pages/ReviewQueue.jsx`     | UI-B                             |
| `frontend/src/pages/Dashboard.jsx`       | UI-C                             |
| `frontend/src/pages/LeadTimeline.jsx`    | UI-C                             |

**Zero conflicts between Track A, B, C, D — they touch completely different files.**
