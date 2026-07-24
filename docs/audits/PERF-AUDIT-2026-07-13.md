# Perf/Efficiency Audit — 2026-07-13

## Scope
Infra (docker-compose.yml, Dockerfiles) already fully optimized from prior audits
(alpine/slim base, multi-stage builds, per-service cpu/mem caps, nginx static serve,
celery solo-pool + result_expires). This run covers new surface added since last audit:
`quick_draft` feature, `app/ai/graphs/`, provider layer.

## Finding: unbounded LLM call timeout (fixed)
`NvidiaProvider` (backend/app/ai/providers.py) is the active provider for
research/email_gen/sentiment (`.env`: `*_PROVIDER=nvidia`). Its `AsyncOpenAI` client had
no explicit `timeout`, defaulting to the SDK's 600s. `quick_draft.py` calls this
synchronously in the request path with only 1 uvicorn worker — a hung upstream (NIM
proxy) would hold a request slot for up to 10 min, compounding under the VPS's
`pids_limit`/`nofile` caps.

Also: SDK-level `max_retries` (default 2) stacked under `safe_generate`'s own 3-attempt
retry loop → worst case 9 upstream calls per logical request, wasting compute on a
capped instance.

**Fix applied**: `AsyncOpenAI(..., timeout=30.0, max_retries=0)` — bounds each call to
30s, leaves retry ownership solely to `safe_generate`.

## Reviewed, no change needed
- `CompanyScraper`: already bounded (10s/page timeout, concurrent gather, resilient to
  failures) — no fix needed.
- `celery_app.py`: `result_expires`, `worker_max_memory_per_child` already set from
  prior audit.
- Multi-provider SDK stack (google-generativeai/groq/anthropic/openai all in
  requirements.txt): intentional runtime-swappable provider architecture via
  `*_PROVIDER` env vars — not dead weight, left as-is (removing would regress a real
  feature, out of scope for an unattended pass).

## File changed
- [backend/app/ai/providers.py](backend/app/ai/providers.py) — added timeout/max_retries to NvidiaProvider's AsyncOpenAI client.
