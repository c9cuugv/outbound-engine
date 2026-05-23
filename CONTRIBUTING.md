# OutboundEngine — Contributor Guidelines
> **Non-negotiable.** Every contributor (human or AI agent) must follow these rules exactly. No skipping steps, no reordering phases, no deviating from defined patterns.
>
> **Current runtime note:** active app excludes parked worker / AI generation surfaces. Treat Celery, campaign chat, bulk research worker, and wizard-era generation flow as archived design material unless they are explicitly re-enabled. See `NOT_WORKING.md`.

## 1. Golden Rules
1. **Follow the build order.** Never implement a story before its prerequisites are complete.
2. **All LLM calls go through `safe_generate()` only.** No direct provider calls anywhere in the codebase.
3. **No email sends automatically.** Always: `draft` → user approves → `scheduled` → sent.
4. **No LLM if scrape is empty.** Set `research_status='failed'` and stop. Never fabricate data.
5. **Tracks own their files.** A/B/C/D touch completely different files — zero cross-track edits allowed.
6. **Every LLM response must be Pydantic-validated** against `ResearchOutput`, `EmailOutput`, or `SentimentOutput`.
7. **No branch merges until all acceptance criteria pass** (Section 3).

## 2. Build Order — Strict Sequence
```
DAY 1-7  (4 parallel branches — do not merge until ALL 4 complete)
  track-a-data:    A-1 Monorepo → A-2 DB → A-3 Auth → A-4 Celery → A-5 CRUD → A-6 CSV → A-7 Lists
  track-b-ai:      B-1 Pydantic Schemas (25+ tests)
  track-c-email:   C-1 Email Provider (Console/Resend/SendGrid)
  track-d-prompts: D-1 Research Prompts → D-2 Email Gen Prompts
MERGE POINT 1 → main  (DAY 8-10)
  M1-1 Provider Factory → M1-2 Safe Generate → M1-3 Scraper + M1-4 Signals (parallel)
MERGE POINT 2  (DAY 11-18)
  M2-1 Research Worker → M2-2 Campaign+Templates → M2-3 Email Gen Worker
  M2-4 Review API + M2-5 Tracking (parallel)
MERGE POINT 3  (DAY 19-22)
  M3-1 Scheduler+Sender → M3-2 Reply Detection → M3-3 Analytics + M3-4 WebSocket (parallel)
FRONTEND SPRINT  (DAY 23-30)
  UI-A: Lead Table + Research  |  UI-B: Campaign Builder + Review Queue  |  UI-C: Dashboard + Timeline
```

## 3. Definition of Done — All Must Pass Before Merge
| Story | Must Pass |
|-------|-----------|
| A-1 | `docker-compose up` → PG:5432, Redis:6379; `GET /health` → `{"status":"ok"}` |
| A-2 | `alembic upgrade head` + `downgrade -1` work; 3 tables match schema exactly |
| A-3 | bcrypt passwords; 30min access / 7d refresh; 409 dup email; 401 no token |
| A-4 | 5 Docker services running; `add.delay(2,3).get()` = 5 |
| A-5 | 5 endpoints; AND filters; pagination math correct; <200ms/1000 leads |
| A-6 | MX check 3s timeout cached; role-based emails rejected; 10K rows no timeout |
| A-7 | Dynamic lists re-evaluate at query time; add to dynamic → 400; no N+1 |
| B-1 | 25+ tests green; all hallucination patterns caught; placeholder rejection; enum constraints |
| C-1 | ConsoleProvider zero-config; `List-Unsubscribe` always present; distinct bounce error types |
| D-1 | Anti-hallucination system prompt; `VERIFIED DATA` markers; ≤4000 chars; no LLM calls |
| D-2 | Anti-buzzword list; "never start with" rules; step 2+ includes prev context; ≤3000 chars |
| M1-1 | 4 providers (Gemini/Groq/ClaudeCode/Anthropic); `ConfigError` on missing key; default gemini |
| M1-2 | JSON error → retry with error; validation error → retry; 3 failures → `GenerationError` |
| M1-3 | HTTPS→HTTP fallback; strip nav/script/style; 2000 chars/page; `{}` on failure |
| M1-4 | Tech detection via HTML patterns; greenhouse/lever hiring check; never raises |
| M2-1 | Rate 10/m; 3 retries backoff; empty scrape → failed (no LLM); confidence <0.6 → needs_review |
| M2-2 | draft→active lifecycle; can't PATCH active campaign; 3 seed templates exist |
| M2-3 | Rate 15/m; `body_original` stored; skips unresearched leads; 3×3=9 rows |
| M2-4 | Only draft→approved; PATCH preserves `body_original`; bulk approve returns `{approved, skipped}` |
| M2-5 | Pixel <50ms; click → 302; unsubscribe cancels sequence; first open sets `opened_at` + stat |
| M3-1 | Timezone/window/days respected; ±15min jitter; 1 email/s; hard bounce cancels sequence |
| M3-2 | IMAP optional (disabled ≠ error); match by `In-Reply-To`; cancel within 60s; sentiment classified |
| M3-3 | Div-by-zero → 0.0; `by_day` includes zero-send days; <500ms/1000 leads |
| M3-4 | JWT via `?token=`; events within 2s; disconnected clients cleaned up |
| UI-A | Status badges (5 states); "Research All" polls 5s; confidence color coding |
| UI-B | 4-step wizard; generate polls status; auto-redirect on completion |
| UI-C | Stats bar; side-panel research; Approve/Edit/Regenerate; Launch when ≥1 approved |
| UI-D | 4 metric cards; Recharts line+bar; live WebSocket feed; timeline with event icons |

## 4. Hard Architecture Rules
**AI/LLM** — `safe_generate(provider, system, user, Schema, max_retries=3)` is the only LLM entry point. Retry: JSON error → inject error into next prompt; Pydantic error → inject validation error; 3rd failure → `GenerationError`. Provider routing via env: `RESEARCH_PROVIDER`, `EMAIL_GEN_PROVIDER`, `SENTIMENT_PROVIDER` (all default `gemini`).

**Data Integrity** — `body_original` is write-once (set at creation, never overwritten). `was_manually_edited=true` on any subject/body PATCH. Dynamic lists never store members — always re-query with `filter_criteria`. Campaign `active` → reject all PATCH with 400.

**Sending & Tracking** — Inject tracking only when `TRACKING_DOMAIN` is set; skip silently if unset. Before every send: skip if lead is `replied | unsubscribed | bounced`. Soft bounce: retry 1hr × 3, then hard bounce. Hard bounce: cancel full sequence immediately. First open/click → set timestamp + increment campaign stat; subsequent → increment count only. Unsubscribe → cancel all pending emails across all campaigns.

**Security** — All endpoints require Bearer JWT except: `/health`, `/auth/*`, `/t/o/*`, `/t/c/*`, `/t/u/*`. WebSocket auth via first message payload `{type:"auth", token:"..."}`. Passwords: bcrypt only — never plaintext, never logged.

## 5. File Ownership — Never Edit Outside Your Story's Files
| File | Story | File | Story |
|------|-------|------|-------|
| `docker-compose.yml` | A-1, A-4 | `ai/schemas.py` | B-1 |
| `app/database.py` | A-2 | `ai/providers.py` + `ai/factory.py` | M1-1 |
| `api/v1/auth.py` | A-3 | `ai/safe_generate.py` | M1-2 |
| `api/v1/leads.py` | A-5,6,7 | `ai/prompts/research.py` | D-1 |
| `api/v1/campaigns.py` | M2-2, M2-4 | `ai/prompts/email_gen.py` | D-2 |
| `api/v1/analytics.py` | M3-3 | `services/scraper.py` | M1-3 |
| `api/v1/tracking.py` | M2-5 | `services/signals.py` | M1-4 |
| `api/v1/websocket.py` | M3-4 | `services/email_provider.py` | C-1 |

## 6. Setup & PR Checklist
```bash
cp .env.example .env && docker compose up -d db redis
cd backend && alembic upgrade head
uvicorn app.main:app --reload                           # API :8000
cd frontend && npm install && npm run dev               # UI :3000
```
**Required env:** `DATABASE_URL` · `REDIS_URL` · `JWT_SECRET`
**Optional env:** `GROQ_API_KEY` · `ANTHROPIC_API_KEY` · `RESEND_API_KEY` · `TRACKING_DOMAIN` · `IMAP_HOST` · `IMAP_EMAIL` · `IMAP_PASSWORD`

**Every PR must include:**
- [ ] Story ID in title — e.g. `[M2-3] Email generation worker`
- [ ] All acceptance criteria from Section 3 pass
- [ ] No files modified outside this story's ownership (Section 5)
- [ ] `pytest` passes with no new failures
- [ ] No direct LLM calls — only `safe_generate()`
- [ ] No hardcoded secrets or API keys in code
- [ ] Alembic migration included if schema changed (downgrade must work)
- [ ] Rate limits respected: research 10/m · email gen 15/m · send 1/s
