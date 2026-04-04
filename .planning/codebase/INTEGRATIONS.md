# External Integrations

**Analysis Date:** 2025-03-02

## APIs & External Services

**AI Language Models (LLMs):**
- **Google Gemini 2.0 Flash** - Default LLM for research and email generation.
  - SDK/Client: `google-generativeai`
  - Auth: `GEMINI_API_KEY`
- **Groq (Llama 3.1 70B)** - Low-latency LLM alternative.
  - SDK/Client: `groq`
  - Auth: `GROQ_API_KEY`
- **Anthropic Claude Sonnet 3.5/3.7** - High-quality LLM for complex tasks.
  - SDK/Client: `anthropic`
  - Auth: `ANTHROPIC_API_KEY`
- **Claude Code CLI** - Local LLM execution via subprocess (Claude Pro/Max subscription).
  - Implementation: `backend/app/ai/providers.py`

**Email Delivery:**
- **Resend** - High-reliability email API.
  - SDK/Client: `resend`
  - Auth: `RESEND_API_KEY`
- **SendGrid** - Established email infrastructure provider.
  - SDK/Client: `sendgrid`
  - Auth: `SENDGRID_API_KEY`

## Data Storage

**Databases:**
- **PostgreSQL**
  - Connection: `DATABASE_URL` (managed by SQLAlchemy in `backend/app/database.py`)
  - Client: `asyncpg` (Asynchronous driver)

**Caching / Message Queue:**
- **Redis**
  - Connection: `REDIS_URL`
  - Usage: Celery broker and result backend. `backend/app/workers/celery_app.py`

**File Storage:**
- **Local filesystem only**
  - Temporary lead data and scraped content storage (not detected as using external cloud storage like S3).

## Authentication & Identity

**Auth Provider:**
- **Custom JWT-based Authentication**
  - Implementation: `backend/app/api/v1/auth.py`
  - Libraries: `python-jose` for JWT tokens, `passlib` for password hashing (bcrypt).
  - Access tokens (30m) and refresh tokens (7d) stored in memory (frontend).

## Monitoring & Observability

**Error Tracking:**
- **None** - (Only standard Python logging detected).

**Logs:**
- **Standard Console Output** - `logging` module used in backend services.

## CI/CD & Deployment

**Hosting:**
- **Not explicitly specified** (Docker-ready for any platform).

**CI Pipeline:**
- **Not detected** (No GitHub Actions or GitLab CI files observed).

## Environment Configuration

**Required env vars:**
- `DATABASE_URL`, `REDIS_URL`
- `JWT_SECRET`
- `GEMINI_API_KEY`, `GROQ_API_KEY`, `ANTHROPIC_API_KEY`
- `RESEND_API_KEY`, `SENDGRID_API_KEY`
- `ALLOWED_ORIGINS` (for CORS)

**Secrets location:**
- `.env` file (local development), environment variables (production).

## Webhooks & Callbacks

**Incoming:**
- `GET /api/v1/tracking/open/{event_id}` - Tracking pixel open events. `backend/app/api/v1/tracking.py`
- `GET /api/v1/tracking/click/{event_id}` - Click redirection tracking. `backend/app/api/v1/tracking.py`

**Outgoing:**
- **None detected** - (Only direct API calls to AI and email providers).

---

*Integration audit: 2025-03-02*
