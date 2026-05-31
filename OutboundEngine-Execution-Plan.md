# OutboundEngine — Parallel Execution Plan

## Progress Tracker
```
TRACK A: Data Layer   [__________] 0/7   TRACK B: AI Schemas  [__________] 0/1
TRACK C: Email Infra  [__________] 0/1   TRACK D: Prompts     [__________] 0/2
MERGE POINT 1         [__________] 0/4   MERGE POINT 2        [__________] 0/5
MERGE POINT 3         [__________] 0/4   FRONTEND SPRINT      [__________] 0/6
TOTAL: 0/28 stories
```

## Build Map
```
DAY 1-7 (parallel)
TRACK A (branch: track-a-data, ~25h)     TRACK B (track-b-ai, ~3h)
  A-1 Monorepo → A-2 Database →           B-1 Pydantic schemas + 30+ tests
  A-3 Auth → A-4 Celery →
  A-5 Lead CRUD → A-6 CSV Import →        TRACK C (track-c-email, ~3h)
  A-7 Lead Lists                           C-1 Email provider abstraction

                                           TRACK D (track-d-prompts, ~5h)
                                           D-1 Research prompts → D-2 Email gen prompts

━━━━━━━━ MERGE POINT 1 (all tracks → main) ━━━━━━━━
DAY 8-10 (sequential then parallel)
  M1-1 Provider Interface + Factory → M1-2 Safe Generate with Retry
  M1-3 Company Scraper ┐ (parallel)
  M1-4 Signal Collector ┘

━━━━━━━━ MERGE POINT 2 ━━━━━━━━
DAY 11-18
  M2-1 Research Worker → M2-2 Campaign CRUD + Templates → M2-3 Email Gen Worker
  M2-4 Email Review API ┐ (parallel)
  M2-5 Tracking System  ┘

━━━━━━━━ MERGE POINT 3 ━━━━━━━━
DAY 19-22
  M3-1 Scheduler + Sender → M3-2 Reply Detection
  M3-3 Analytics API ┐ (parallel)
  M3-4 WebSocket     ┘

━━━━━━━━ FRONTEND SPRINT (3 parallel tracks) ━━━━━━━━
DAY 23-30
  UI-A: Lead Table + Research Panel
  UI-B: Campaign Builder + Review Queue
  UI-C: Dashboard + Lead Timeline
```

## Stories — Definition of Done

| ID | Story | Track | Effort | Key Acceptance Criteria |
|----|-------|-------|--------|------------------------|
| A-1 | Monorepo Init | A | M | `docker-compose up` → PG:5432, Redis:6379; `/health` → `{"status":"ok"}` |
| A-2 | Database + Alembic | A | M | `alembic upgrade head` creates `leads`, `lead_lists`, `lead_list_members`; downgrade works |
| A-3 | Auth (JWT) | A | M | bcrypt passwords; access 30min, refresh 7d; 409 on dup email; 401 without token |
| A-4 | Celery Setup | A | M | 5 Docker services; `add.delay(2,3).get()` = 5 |
| A-5 | Lead CRUD | A | L | All 5 endpoints; pagination math correct; AND filters; <200ms/1000 leads |
| A-6 | CSV Import | A | L | MX check (3s timeout, cached); role-based rejected; 10K rows no timeout |
| A-7 | Lead Lists | A | M | Dynamic lists evaluate at query time; add to dynamic → 400; no N+1 |
| B-1 | Pydantic Schemas | B | M | 25+ tests; hallucination patterns caught; placeholder rejection; enum constraints |
| C-1 | Email Provider | C | M | ConsoleProvider zero-config; List-Unsubscribe always; HardBounce/SoftBounce distinct |
| D-1 | Research Prompts | D | S | Anti-hallucination system prompt; VERIFIED DATA markers; ≤4000 chars; no LLM calls |
| D-2 | Email Gen Prompts | D | M | Anti-buzzword list; "never start with" rules; step 2+ includes prev context; ≤3000 chars |
| M1-1 | Provider Factory | MP1 | L | 4 providers (Gemini/Groq/ClaudeCode/Anthropic); ConfigError on missing key; default gemini |
| M1-2 | Safe Generate | MP1 | M | Retry loop: JSON error → retry; validation error → retry; exhausted → GenerationError |
| M1-3 | Scraper | MP1 | M | HTTPS→HTTP fallback; strip nav/script/style; 2000 chars/page; `{}` on failure |
| M1-4 | Signal Collector | MP1 | M | Tech detection via HTML patterns; greenhouse/lever hiring check; never raises |
| M2-1 | Research Worker | MP2 | L | Rate 10/m; 3 retries; empty scrape → failed (no LLM); confidence <0.6 → needs_review |
| M2-2 | Campaign CRUD + Templates | MP2 | L | draft→active lifecycle; can't edit active; 3 seed templates |
| M2-3 | Email Gen Worker | MP2 | XL | Rate 15/m; body_original stored; skips unresearched leads; 3×3=9 rows |
| M2-4 | Email Review API | MP2 | L | Only draft→approved; edit preserves original; bulk approve returns counts |
| M2-5 | Tracking System | MP2 | L | Pixel <50ms; click 302; unsubscribe cancels sequence; first open sets opened_at |
| M3-1 | Scheduler + Sender | MP3 | XL | Timezone/window/days respected; ±15min jitter; hard bounce cancels sequence |
| M3-2 | Reply Detection | MP3 | L | IMAP optional; match by In-Reply-To; cancel within 60s; sentiment via SentimentOutput |
| M3-3 | Analytics API | MP3 | L | Rates div-by-zero safe; by_day includes zero days; <500ms/1000 leads |
| M3-4 | WebSocket | MP3 | M | JWT via query param; events within 2s; disconnected clients cleaned up |
| UI-A | Lead Table + Research | FE | L+M | Status badges; "Research All" polls 5s; confidence color coding |
| UI-B | Campaign Builder | FE | XL | 4-step wizard; generate polls status; auto-redirect on completion |
| UI-C | Review Queue | FE | XL | Stats bar; side-panel research; Approve/Edit/Regenerate; Launch when ≥1 approved |
| UI-D | Dashboard + Timeline | FE | XL+M | 4 metric cards; Recharts line+bar; live WebSocket feed; timeline with icons |

## File Ownership Map
| File | Stories | File | Stories |
|------|---------|------|---------|
| `docker-compose.yml` | A-1, A-4 | `ai/schemas.py` | B-1 |
| `app/database.py` | A-2 | `ai/providers.py` | M1-1 |
| `api/v1/auth.py` | A-3 | `ai/factory.py` | M1-1 |
| `api/v1/leads.py` | A-5, A-6, A-7 | `ai/safe_generate.py` | M1-2 |
| `api/v1/campaigns.py` | M2-2, M2-4 | `ai/prompts/research.py` | D-1 |
| `api/v1/analytics.py` | M3-3 | `ai/prompts/email_gen.py` | D-2 |
| `api/v1/tracking.py` | M2-5 | `services/scraper.py` | M1-3 |
| `api/v1/websocket.py` | M3-4 | `services/signals.py` | M1-4 |
| `workers/research_tasks.py` | M2-1 | `services/email_provider.py` | C-1 |
| `workers/email_gen_tasks.py` | M2-3 | `services/tracking.py` | M2-5 |
| `workers/send_tasks.py` | M3-1 | `workers/reply_tasks.py` | M3-2 |

**Zero conflicts between Track A/B/C/D — they touch completely different files.**
