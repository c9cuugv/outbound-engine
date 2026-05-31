# OutboundEngine — PRD

**One-liner:** Open-source system that researches target accounts with AI, generates hyper-personalized multi-step email sequences, and manages sending with deliverability-aware scheduling and full analytics.

## Architecture
```
React Frontend ──REST/WS──► FastAPI ──► PostgreSQL
                                    ──► Redis + Celery (workers + beat)
                                    ──► AI Engine (Gemini/Groq/Claude)
                                    ──► Email Provider (Resend/SendGrid/Console)
                                    ──► Tracking Server (open pixel, click redirect)
```

## Tech Stack
| Layer | Tech | Notes |
|-------|------|-------|
| API | FastAPI + asyncpg | Async, auto-docs |
| DB | PostgreSQL + Alembic | JSONB for flexible fields |
| Queue | Redis + Celery | Worker + Beat scheduler |
| Frontend | React + Vite + Tailwind + Recharts | |
| AI default | Gemini 2.0 Flash | FREE, 15 RPM, 1M TPM |
| AI alt free | Groq Llama 3.1 70B | FREE, 30 RPM |
| AI premium | Claude Code CLI / Anthropic API | Best quality |
| Email | Resend or SendGrid | ConsoleProvider for dev |
| Scraping | httpx + BeautifulSoup | Async, 10s timeout |
| Auth | JWT (python-jose + bcrypt) | 30min access / 7d refresh |

## Core Modules

**M1 — Lead Management:** CSV upload with email regex + MX check + role-based rejection (`info@`, `support@`, etc.) + dedup. CRUD with pagination/filtering. Static and dynamic lists (dynamic re-evaluates `filter_criteria` at query time). Tables: `leads`, `lead_lists`, `lead_list_members`.

**M2 — Research Agent:** Per-lead pipeline: scrape 7 pages (/, /about, /careers, /pricing…) → collect signals (tech stack via HTML patterns, hiring via greenhouse/lever) → AI synthesis via `safe_generate` → store on lead. Rate: 10/min. Status: `pending → in_progress → completed | needs_review | failed`. No LLM call if scrape empty.

**M3 — Email Generation:** Templates store system prompt + generation prompt per sequence step. `generate_campaign_emails` Celery task: for each researched lead × each template → `safe_generate(EmailOutput)` → store as `draft`. Rate: 15/min. `body_original` preserved. Campaign: `draft → generating → review`.

**M4 — Campaign Management:** Campaign holds product context (name, description, ICP, value prop), sender config, sending schedule (timezone, days, window, max/day, jitter), and A/B test config. Lifecycle: `draft → generating → review → active → paused → completed`.

**M5 — Sending Engine:** Celery Beat every 60s picks up `scheduled` emails. Respects timezone, sending window, daily limit, ±15min jitter, 1 email/s rate. Skip if lead replied/unsubscribed/bounced. Hard bounce → cancel sequence. Soft bounce → retry 1hr × 3. Tracking injection: 1×1 pixel + link rewriting + unsubscribe link (skipped if `TRACKING_DOMAIN` unset).

**M6 — Reply Detection:** IMAP polling every 5min (disabled if not configured). Match by `In-Reply-To` header. On match: cancel remaining sequence, classify sentiment via `SentimentOutput` (interested/not_interested/out_of_office/unsubscribe/question). Store in `replies` table.

**M7 — Analytics:** Campaign overview (open/click/reply/bounce rates), by-day breakdown, by-sequence-step, A/B results, sentiment breakdown, lead timeline. WebSocket `/ws/campaigns/{id}` pushes live events via Redis pub/sub. Auth via `?token=` query param.

## Anti-Hallucination Strategy
1. **No LLM if no data** — empty scrape → `failed`, no prompt sent
2. **Pydantic validation on every output** — `ResearchOutput` rejects "founded in", "revenue of", "raised $", "million users", "valued at"; `EmailOutput` rejects unresolved placeholders; `SentimentOutput` enum-constrained
3. **Safe generate retry loop** — JSON error or validation failure → retry with error in prompt; 3 attempts max → `GenerationError`
4. **Human review gate** — every email stays `draft` until user explicitly approves; UI shows research alongside email for cross-reference

## API Endpoints
```
Auth:      POST /auth/register|login|refresh
Leads:     POST|GET /leads  ·  GET|PATCH|DELETE /leads/{id}  ·  POST /leads/bulk  ·  POST /leads/{id}/research
Lists:     POST|GET /lists  ·  POST|DELETE /lists/{id}/leads
Campaigns: POST|GET /campaigns  ·  GET|PATCH /campaigns/{id}  ·  POST /campaigns/{id}/generate|launch|pause|resume
Emails:    GET /campaigns/{id}/emails  ·  GET|PATCH /campaigns/{id}/emails/{eid}
           POST /campaigns/{id}/emails/approve  ·  POST /campaigns/{id}/emails/{eid}/regenerate
Templates: POST|GET /templates  ·  PATCH /templates/{id}
Analytics: GET /campaigns/{id}/analytics  ·  GET /campaigns/{id}/leads/{lid}/timeline
Webhooks:  POST /webhooks/sendgrid|resend
Tracking:  GET /t/o/{id}.png  ·  GET /t/c/{id}/{hash}  ·  GET /t/u/{id}
WebSocket: WS /ws/campaigns/{id}
```

## Story Dependency Graph
```
Phase 1 (Wk 1-2):  1.1 → 1.2 → 1.3 · 1.2 → 2.1 → 2.2 → 2.4 · 1.1 → 1.4
Phase 2 (Wk 3-4):  3.1+3.2 → 3.3 · 4.1+4.2+4.3 (parallel) → 4.4 → 4.5
Phase 3 (Wk 5-6):  5.1+5.2+5.3 (parallel) → 5.4 → 5.5 · 5.1+5.2 → 5.6 → 5.7
Phase 4 (Wk 7-8):  6.1+6.2 → 6.3 → 6.4 → 6.5 → 6.6
Phase 5 (Wk 9-10): 6.4+6.6 → 7.1 → 7.2 → 7.3 · 7.1 → 7.4
```

## Backlog Summary (28 stories, ~142 hrs)
| Epic | Stories | Effort |
|------|---------|--------|
| 1. Infrastructure | 1.1 Monorepo · 1.2 DB · 1.3 Auth · 1.4 Celery | ~12h |
| 2. Lead Management | 2.1 CRUD · 2.2 CSV · 2.3 Lists · 2.4 UI Table | ~16h |
| 3. AI Layer | 3.1 Providers · 3.2 Schemas · 3.3 Safe Generate | ~10h |
| 4. Research | 4.1 Scraper · 4.2 Signals · 4.3 Prompts · 4.4 Worker · 4.5 UI | ~16h |
| 5. Email Gen | 5.1 Campaign · 5.2 Templates · 5.3 Prompts · 5.4 Worker · 5.5 Review API · 5.6-5.7 UI | ~40h |
| 6. Sending | 6.1 Provider · 6.2 Injection · 6.3 Tracking · 6.4 Events · 6.5 Scheduler · 6.6 Replies | ~28h |
| 7. Analytics | 7.1 API · 7.2 WebSocket · 7.3 Dashboard UI · 7.4 Timeline UI | ~20h |

## Key Data Models
- **leads**: UUID, name, email (unique), company fields, enrichment JSONB, status, research_status
- **campaigns**: product context, sender config, schedule config, A/B config, status, denormalized stats
- **email_templates**: system_prompt, generation_prompt, sequence_position, days_delay
- **generated_emails**: lead+campaign+template FK, subject, body, body_original, status, tracking timestamps
- **tracking_events**: email_id, event_type, ip, user_agent, link_url, created_at
- **replies**: email_id, body, sentiment, received_at
