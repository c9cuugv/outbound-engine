# OutboundEngine

**AI-Powered Cold Outreach Campaign Orchestrator**

An open-source system that researches target accounts using AI, generates hyper-personalized multi-step email sequences, and manages sending with deliverability-aware scheduling and full analytics.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite + Tailwind 4 |
| API | FastAPI (Python 3.12) |
| Database | PostgreSQL 16 + Alembic migrations |
| Queue | Redis 7 + Celery (workers + beat) |
| AI | Gemini (free default), Groq (free), Claude (paid) |
| Email | Resend / SendGrid |
| State | TanStack Query + React Hook Form + Zod |
| Charts | Recharts |
| Real-time | WebSocket (live campaign events) |

## Project Structure

```
outbound-engine/
├── backend/
│   ├── app/
│   │   ├── ai/                # AI provider layer
│   │   │   ├── factory.py     # Provider registry & selection
│   │   │   ├── providers.py   # Gemini, Groq, Claude, Anthropic API
│   │   │   ├── safe_generate.py # Retry + JSON parsing + validation
│   │   │   ├── schemas.py     # Pydantic output schemas (anti-hallucination)
│   │   │   └── prompts/       # Research & email generation prompts
│   │   ├── api/v1/            # REST endpoints (auth, leads, campaigns, analytics, tracking, websocket)
│   │   ├── models/            # SQLAlchemy ORM (user, lead, campaign, template, email, reply, tracking)
│   │   ├── schemas/           # Pydantic request/response schemas
│   │   ├── services/          # Business logic (auth, CSV import, email providers, scraper, signals)
│   │   ├── workers/           # Celery tasks (email gen, send, reply detection, research)
│   │   └── utils/             # Email validation, helpers
│   ├── alembic/               # 7 database migrations
│   ├── tests/                 # Schema validation tests
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/             # LeadTable, CampaignWizard, EmailReviewQueue, CampaignDashboard
│   │   ├── components/        # Layout (AppLayout, Sidebar), UI (Button, Card, Badge, Spinner), Leads (ResearchPanel)
│   │   ├── hooks/             # useLeads, useCampaigns, useWebSocket
│   │   ├── api/               # Axios client with JWT + refresh
│   │   └── types/             # Lead, Campaign, Analytics TypeScript types
│   ├── package.json
│   └── vite.config.ts         # Proxy to backend :8000
├── docker-compose.yml         # PostgreSQL + Redis + API + Worker + Beat
├── .env.example
├── OutboundEngine-PRD.md
├── OutboundEngine-Execution-Plan.md
└── DEVELOPER-B-PLAN.md
```

## Quick Start

```bash
# 1. Clone and configure
cp .env.example .env
# Edit .env — at minimum set GEMINI_API_KEY (free from aistudio.google.com)

# 2. Start infrastructure
docker-compose up -d db redis

# 3. Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# 4. Frontend (new terminal)
cd frontend
npm install
npm run dev
# Opens at http://localhost:3000
```

## AI Provider Configuration

```env
# At least one required (Gemini is free, no credit card)
GEMINI_API_KEY=AIza...              # Free from aistudio.google.com
GROQ_API_KEY=gsk_...               # Free from console.groq.com
ANTHROPIC_API_KEY=sk-ant-...       # Paid

# Task-to-provider mapping (all default to gemini)
RESEARCH_PROVIDER=gemini
EMAIL_GEN_PROVIDER=gemini
SENTIMENT_PROVIDER=gemini
```

## Architecture

```
React (localhost:3000)
  │ Vite proxy /api → :8000
  ▼
FastAPI (REST + WebSocket)
  ├── PostgreSQL 16 (data layer, 7 tables)
  ├── Redis 7 (Celery broker + cache)
  ├── Celery Workers
  │   ├── Research pipeline (scrape → signals → AI synthesis)
  │   ├── Email generation (AI-powered, anti-spam prompts)
  │   ├── Email sending (Resend/SendGrid, rate-limited)
  │   └── Reply detection (IMAP polling, sentiment classification)
  └── AI Engine (multi-provider factory)
      ├── Gemini 2.0 Flash (free default)
      ├── Groq Llama 3.1 70B (free alternative)
      └── Anthropic Claude (paid, highest quality)
```

## License

MIT
