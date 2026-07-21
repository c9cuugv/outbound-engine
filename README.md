# OutboundEngine

Local-first AI outbound outreach app: import leads, research accounts, generate
personalized email sequences, review drafts, and track sends.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | React 18 + TypeScript + Vite 6 + Tailwind 4 |
| API | FastAPI + SQLAlchemy (async) |
| Workers | Celery + Redis |
| DB | PostgreSQL 16 |
| Cache / pub-sub / broker | Redis 7 |
| Migrations | Alembic |
| AI | pluggable provider (NVIDIA NIM / Gemini / Groq / Anthropic / stub) |

## Layout

```text
outbound-engine/
├── backend/
│   ├── app/api/v1/     # REST + websocket routes (10 routers, see app/main.py)
│   ├── app/models/     # SQLAlchemy models
│   ├── app/services/   # auth, lead, campaign, tracking, csv import, scraper
│   ├── app/ai/         # provider factory, prompts, LangGraph pipelines
│   ├── app/workers/    # Celery tasks (research, email-gen, send, reply)
│   ├── alembic/        # migrations
│   ├── pytest.ini      # test config (asyncio + per-test timeout)
│   └── tests/          # 221 backend tests
├── frontend/
│   ├── src/styles/globals.css   # the single design-token layer (see docs/DESIGN.md)
│   ├── src/components/ui/        # design-system primitives
│   ├── src/pages/               # login, leads, campaigns, review, dashboard, timeline, quick-draft
│   ├── src/hooks/               # react-query + websocket hooks
│   ├── src/api/                 # typed API client (one module per endpoint group)
│   └── tests/e2e/              # Playwright specs (mocked suite + gated live smoke)
├── docs/DESIGN.md      # design system spec — authoritative for the UI
├── docker-compose.yml  # db + redis + api + worker + frontend
└── PLAN-CLEANUP-2026-07-19.md   # cleanup/rebuild plan and status
```

## Local setup

```bash
cp .env.example .env            # set JWT_SECRET; AI provider optional (use *_PROVIDER=stub for zero-config)

docker compose up -d db redis   # infra only

cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000        # API on :8000, docs at /docs

# optional: background workers (needs a broker + AI provider)
python -m celery -A app.workers.celery_app worker --loglevel=info

cd ../frontend
npm install
npm run dev                     # UI on :3000, proxies /api and /ws to :8000
```

## Docker (full stack)

```bash
cp .env.example .env
docker compose up -d            # db + redis + api + worker + frontend
```

- Frontend: `http://localhost:3000`
- API + docs: `http://localhost:8000/docs`

## Verification

```bash
# backend — 221 tests, ~45s
cd backend && ./venv/bin/python -m pytest -q

# frontend — types + production build
cd frontend && npx tsc --noEmit && npm run build

# frontend E2E — mocked suite (no backend needed; runs its own vite on a dedicated port)
cd frontend && npx playwright test features/

# live E2E smoke — needs a real backend + AI provider, off by default
cd frontend && RUN_LIVE_E2E=1 npx playwright test features/live.spec.ts
```

## Env notes

- `.env.example` uses `localhost` URLs for a host-run backend; docker-compose
  overrides DB/Redis/AI hosts inside the containers.
- Set a strong `JWT_SECRET` before running outside tests.
- `*_PROVIDER=stub` runs the AI pipelines with no API key, for local demos.
- Live email send defaults to `ConsoleProvider` (prints instead of sending);
  reply detection (IMAP) is off unless credentials are configured.
