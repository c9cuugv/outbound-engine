# Perf/Efficiency Audit — 2026-07-17

Automated run of the performance-efficiency-protocol scheduled task. Unattended —
no destructive or write actions taken beyond this report.

## Scope
Infra (docker-compose.yml, both Dockerfiles, both .dockerignore, nginx.conf,
celery_app.py) re-verified against the 4 protocol pillars (slim images, compute
conservation, resource capping, static frontend serving) via `git diff HEAD`
against 07-16's baseline. Also swept new/changed surface since 07-16:
`backend/app/main.py`, `frontend/src/App.tsx`, `frontend/src/components/layout/Sidebar.tsx`.

## Reviewed, no change needed — infra byte-for-byte unchanged since 07-16
- `git diff HEAD` on `docker-compose.yml`, both `Dockerfile`s, both
  `.dockerignore`, and `frontend/nginx.conf` is identical to what 07-16 already
  audited. Zero new drift.
- Resource caps re-verified: `db` 0.5cpu/150M, `redis` 0.25cpu/128M, `api`
  0.5cpu/256M, `worker` 0.5cpu/192M, `frontend` 0.25cpu/64M. All 5 services
  capped, matches Resource Capping pillar.
- Backend Dockerfile: 2-stage `python:3.12-slim`, non-root `appuser`, builder
  discards `gcc`/`libpq-dev`. Frontend Dockerfile: `node:22-alpine` build →
  `nginx:stable-alpine` serve, `worker_processes 1` forced. Both still slim per
  protocol.
- `backend/app/workers/celery_app.py`: `result_expires=3600`,
  `worker_max_memory_per_child=90000`, `--pool=solo --concurrency=1` in
  docker-compose worker command — unchanged, still self-recycles before hitting
  the 192M cap.
- Docker image sizes measured: `outbound-engine-api:latest` 436MB (unchanged
  finding from 07-16, root-caused to legit `openai`+`google-generativeai` SDKs,
  not a Dockerfile defect), `outbound-engine-frontend:latest` 63.3MB (healthy,
  static nginx serve confirmed working).

## Reviewed, no change needed — new app surface adds no footprint
- `backend/app/main.py`: 2-line diff, wires `quick_draft_router` into the app —
  routing only, zero new deps, zero compute impact.
- `frontend/src/App.tsx` / `Sidebar.tsx`: route + nav entry for
  `QuickDraft`/`LeadTimeline` pages — client-side routing only.
- `backend/requirements.txt` and `frontend/package.json`: `git diff HEAD` empty
  on both — zero new pins since last commit.

## Finding: langgraph/langchain-core landmine — unchanged, still open (no fix applied)
Same finding carried from 06-13 → 07-16, re-verified today: `backend/requirements.txt`
has zero `langgraph`/`langchain` pins, `backend/app/ai/graphs/*.py` still
imports both, and nothing outside `app/ai/graphs/` references the module — still
dead, unwired code. No compute spent, no drift. Left open: pinning now bakes
weight into every image for a feature nothing calls yet; removing the framework
is a product call outside an unattended infra pass. Flagged again for the
feature owner.

## Observation (not actioned): stray root-level dirs/files, zero Docker footprint
`.hermes/`, `new_learning/`, `outbound_engine/`, `playwright-transform-cache-502/`,
`health_check.txt`, `test_api.py`, `AUDIT-SPEC.md` are untracked at repo root
(all pre-date this audit by weeks per mtime — not new today). All sit outside
both build contexts (`backend/`, `frontend/`), so `COPY . .` in either Dockerfile
never touches them — zero image-size or build-time impact. Combined size ~104KB,
not a resource concern. Git hygiene item, not a perf/infra one — left untouched
per unattended-run scope.

## Files changed
None. All 4 protocol pillars re-verified as already satisfied; zero infra drift
since 07-16; new app-level code reviewed today (`quick_draft` router wiring,
frontend routing) introduces no new dependencies or compute cost.
