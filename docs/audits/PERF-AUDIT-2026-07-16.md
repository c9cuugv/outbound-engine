# Perf/Efficiency Audit — 2026-07-16

Automated run of the performance-efficiency-protocol scheduled task. Unattended —
no destructive or write actions taken beyond this report.

## Scope
Infra (docker-compose.yml, both Dockerfiles, both .dockerignore, nginx.conf,
celery_app.py) re-verified against the 4 protocol pillars (slim images, compute
conservation, resource capping, static frontend serving). Also swept new surface
since 07-15's audit: `backend/app/api/v1/quick_draft.py`, `backend/app/ai/graphs/`,
`backend/tests/test_graphs/`, `frontend/src/pages/QuickDraft.tsx`,
`frontend/src/pages/LeadTimeline.tsx`, `frontend/src/api/timeline.ts` — none of this
is infra, but new code can smuggle in heavy deps, so it's in scope for a dependency
check.

## Reviewed, no change needed — infra unchanged since 07-13
- `git diff HEAD` on `docker-compose.yml`, both `Dockerfile`s, both
  `.dockerignore`, and `frontend/nginx.conf` matches exactly what 07-14/07-15
  already audited and left in the working tree (uncommitted). Zero new drift.
- Resource caps re-verified line by line: `db` 0.5cpu/150M, `redis` 0.25cpu/128M,
  `api` 0.5cpu/256M, `worker` 0.5cpu/192M, `frontend` 0.25cpu/64M. All 5 services
  capped — matches Resource Capping protocol requirement.
- Backend Dockerfile: 2-stage `python:3.12-slim`, builder stage installs
  `gcc`/`libpq-dev` and discards them, runtime stage copies only
  `/root/.local` + `app/`. Frontend Dockerfile: build stage → nginx serve stage,
  `worker_processes 1` forced to match the 0.25 cpu cap. Both still slim/alpine
  per protocol.
- `backend/app/workers/celery_app.py`: `result_expires=3600` and
  `worker_max_memory_per_child=90000` (from a prior session, uncommitted) still
  in place — worker self-recycles before hitting the 192M container cap instead
  of relying on an OOM kill. `--pool=solo --concurrency=1` in
  `docker-compose.yml`'s worker command matches (avoids process-fork overhead on
  a CPU-capped box).

## Reviewed, no change needed — new app surface adds no footprint
- `backend/requirements.txt`: `git diff HEAD` empty — zero new pins since last
  commit. Confirmed via targeted grep: no `langgraph`/`langchain` entries; the
  only AI/HTTP-adjacent deps present are `httpx==0.27.0`,
  `beautifulsoup4==4.12.3`, `google-generativeai==0.8.0`, `openai==1.54.0` — all
  pre-existing, all used by the new `quick_draft` endpoint via already-pinned
  `CompanyScraper`/`safe_generate`/`get_provider`. No new library introduced.
- `frontend/package.json`: `git diff HEAD` empty — zero new dependencies for
  `QuickDraft.tsx`/`LeadTimeline.tsx`/`timeline.ts`; they run on the existing
  `axios`/`recharts`/`react-router-dom` set.
- `backend/app/ai/providers.py` (`NvidiaProvider`): added `base_url` override,
  `timeout=30.0`, `max_retries=0` on the `AsyncOpenAI` client. This *helps*
  compute conservation — a hung/unreachable local NIM proxy now fails fast
  instead of the SDK's default retry backoff burning CPU/wall-clock on a capped
  container.

## Finding: langgraph/langchain-core landmine — unchanged, still open (no fix applied)
Same finding as 06-13 → 07-15, re-verified today: `backend/requirements.txt` has
zero `langgraph`/`langchain` pins, `backend/app/ai/graphs/{email_gen,reply,research}_graph.py`
still import both (`langgraph.graph`, `langgraph.checkpoint.memory`,
`langchain_core.runnables`), and repo-wide grep for `app.ai.graphs`/`ai\.graphs`
outside `app/ai/graphs/` itself returns zero hits — still dead, unwired code, so
the missing pins never break a build. No compute spent, no drift since last audit.
Left open per prior reasoning: pinning now bakes the weight into every image for a
feature nothing calls yet; ripping out the framework is a product call outside an
unattended infra pass. Flagged again for the feature owner.

## Observation (not actioned): `outbound-engine-api` image measures 436MB locally
`docker images` shows `outbound-engine-api:latest` at 436MB — above the
illustrative ~150MB figure in the protocol's own worked example. Root-caused to
legitimate installed packages, not a Dockerfile defect: the multi-stage build
already discards `gcc`/`libpq-dev` after the wheel build, and the runtime stage
copies only `/root/.local` + `app/`. The weight comes from `openai` +
`google-generativeai` (two AI provider SDKs, each with their own HTTP/protobuf
transitive deps) plus `beautifulsoup4`/`httpx` for scraping — all in active use.
Further reduction would mean dropping one of the two AI SDKs or vendoring a
thinner HTTP-only client, which is a product/architecture call, not an
unattended infra fix. Not actioned this run.

## Files changed
None. All 4 protocol pillars re-verified as already satisfied; no drift since
07-15; no new dependencies introduced by the new app-level code reviewed today.
