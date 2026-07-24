# NOT_WORKING

> **Updated 2026-06-11:** All previously parked surfaces have been restored and are operational.

## Status: All Surfaces Active ✅

All services listed below were previously parked but have been restored to the active stack.

### Restored Services

| Surface | Status | Restored in |
| --- | --- | --- |
| Celery worker | ✅ Running | `docker-compose.yml` — `worker` service healthy |
| AI campaign chat API + UI | ✅ Wired | Generation pipeline uses NVIDIA/proxy provider |
| Campaign wizard | ✅ Working | `CampaignBuilder.tsx` 4-step wizard, async email generation |
| Email generate / regenerate endpoints | ✅ Working | `email_gen_tasks.py` + `safe_generate` + provider factory |
| Lead bulk research worker route / UI control | ✅ Working | `research_tasks.py` + `ResearchPanel.tsx` |
| Worker task modules | ✅ Working | `celery_app.py` includes all task modules |

### Active Stack (docker compose)

```
outbound-engine-api-1      Up (healthy)
outbound-engine-db-1       Up (healthy)
outbound-engine-frontend-1 Up (healthy)
outbound-engine-redis-1    Up (healthy)
outbound-engine-worker-1   Up (healthy)
```

### Active App Surfaces

- Auth (register, login, refresh, JWT)
- Leads CRUD + CSV import + lead lists
- Lead Timeline (collapsible research, chronological events, reply previews)
- Campaigns CRUD + lifecycle (draft → generating → review → active)
- Email review / approve / regenerate
- Tracking (pixel, click redirect, unsubscribe)
- Analytics API
- WebSocket live feed
- AI research pipeline (scrape → signals → LLM synthesis)
- AI email generation pipeline (per lead × template)
- Reply detection (IMAP, when configured)
- Scheduler + send worker (ConsoleProvider for dev)

### Notes

- AI provider defaults to NVIDIA/proxy (`NVIDIA_BASE_URL` in `.env`).
- `StubProvider` available for zero-config demo (set `*_PROVIDER=stub`).
- Redis used for tracking, WebSocket pub/sub, and Celery broker.
- Celery Beat scheduled tasks: `process_scheduled_emails` (60s), `check_for_replies` (300s).
