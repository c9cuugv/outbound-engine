# Perf/Efficiency Audit — 2026-07-18

Automated run of the performance-efficiency-protocol scheduled task. Unattended —
no destructive or write actions taken beyond this report.

## Scope
Infra (docker-compose.yml, both Dockerfiles, both .dockerignore, nginx.conf,
celery_app.py) re-verified against the 4 protocol pillars (slim images, compute
conservation, resource capping, static frontend serving) via `git diff HEAD`
plus mtime check against 07-17's baseline. Also re-swept prior app-level
findings (`quick_draft` router, AI graphs module, frontend routing).

## Reviewed, no change needed — infra byte-for-byte unchanged since 07-17
- `git diff HEAD` on `docker-compose.yml`, both `Dockerfile`s, both
  `.dockerignore`, `frontend/nginx.conf`, and `celery_app.py` identical to what
  07-17 audited — same working-tree diff, no new hunks.
- mtime check confirms zero edits since 07-17: newest of the six is
  `docker-compose.yml` at Jul 9 22:13, rest range Jun 12–23. Nothing touched
  today or yesterday.
- Resource caps unchanged: `db` 0.5cpu/150M, `redis` 0.25cpu/128M, `api`
  0.5cpu/256M, `worker` 0.5cpu/192M, `frontend` 0.25cpu/64M. All 5 services
  capped, matches Resource Capping pillar.
- Backend Dockerfile: 2-stage `python:3.12-slim`, non-root `appuser`, builder
  discards `gcc`/`libpq-dev` via `--no-install-recommends`. Frontend
  Dockerfile: `node:22-alpine` build → `nginx:stable-alpine` serve,
  `worker_processes 1` forced, build output gzip-precompressed. Both still
  slim per protocol.
- `backend/app/workers/celery_app.py` + worker command: `result_expires=3600`,
  `worker_max_memory_per_child=90000`, `--pool=solo --concurrency=1
  --time-limit=300 --soft-time-limit=270` — unchanged, still bounded and
  self-recycling under the 192M cap.

## Reviewed, no change needed — no new app surface since 07-17
- `backend/app/main.py`, `frontend/src/App.tsx`, `frontend/src/components/layout/Sidebar.tsx`,
  `backend/app/api/v1/quick_draft.py`, `frontend/src/pages/QuickDraft.tsx`,
  `frontend/src/pages/LeadTimeline.tsx`, `frontend/src/api/timeline.ts` — all
  last modified Jun 11 or earlier, predating even the 07-17 pass. No new diff
  to review today.
- `backend/requirements.txt` and `frontend/package.json`: `git diff HEAD` empty
  on both — zero new pins since last commit, same as every prior audit day.

## Finding: langgraph/langchain-core dead code — unchanged, still open (no fix applied)
Same finding carried from 06-13 → 07-17, re-verified today: `backend/requirements.txt`
still has zero `langgraph`/`langchain` pins; `backend/app/ai/graphs/research_graph.py`,
`email_gen_graph.py`, `reply_graph.py` still import both; nothing outside
`app/ai/graphs/` references the module (last touched May 28–29, untouched
since). Still dead, unwired code — no image weight paid today because nothing
outside the module imports it, but pinning it later bakes weight into every
image for a feature nothing calls. Removing the framework or wiring the
feature is a product call outside an unattended infra pass. Flagged again for
the feature owner.

## Observation (not actioned): stray root-level dirs/files, zero Docker footprint
`.hermes/`, `AUDIT-SPEC.md`, and the accumulated `PERF-AUDIT-*.md` series
remain untracked at repo root. All sit outside both build contexts
(`backend/`, `frontend/`), so `COPY . .` in either Dockerfile never touches
them — zero image-size or build-time impact. Git hygiene item, not a
perf/infra one — left untouched per unattended-run scope.

## Files changed
None. All 4 protocol pillars re-verified as already satisfied; zero infra
drift since 07-17; no new app-level code to review this cycle.
