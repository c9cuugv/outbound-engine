# Perf/Efficiency Audit — 2026-07-15

## Scope
Infra (docker-compose.yml, both Dockerfiles, both .dockerignore) unchanged since
07-13 — still slim/alpine, multi-stage, per-service cpu/mem caps. Last actual infra
commit is `07ec94c` (Jun 6: parameterized `POSTGRES_PASSWORD`, added uvicorn
`--timeout-keep-alive 75`), already reflected in the working tree. No new commits
since 07-14's audit; this run covers new *untracked* surface in the working tree:
`AUDIT-SPEC.md`, `.hermes/`, `health_check.txt`, `new_learning/`, `outbound_engine/`.

## Finding: langgraph/langchain-core landmine — unchanged, still open (no fix applied)
Same finding as 06-13/07-14, re-verified today: `backend/requirements.txt` still has
zero `langgraph`/`langchain` pins (grep confirmed), `app/ai/graphs/*` still imports
both, and still nothing in `app/api`/`app/workers`/`app/services` imports
`app.ai.graphs` (grep confirmed, zero hits). No drift since last audit — landmine
dormant, no compute spent, no container currently breaks. Leaving open per prior
reasoning: fixing the import by pinning the deps bakes weight into every build for a
feature not yet wired in; ripping out the framework choice is a product call outside
an unattended infra pass. Still flagged for the feature owner: pin now and accept the
weight, or port to plain-async before wiring (matches `quick_draft.py`'s existing
pattern).

## Reviewed, no change needed
- `outbound_engine/tasks.py` (untracked, repo root, 11 lines): standalone example
  Celery app (`Celery('outbound-engine', broker='redis://redis:6379/0')` +
  `example_task`) — not `backend/app/workers/celery_app.py`, the real worker entry
  point used by `docker-compose.yml`'s `worker` service. Root-level dir, outside both
  `./backend` and `./frontend` Docker build contexts, so it can never enter an image
  regardless of `.dockerignore` contents. Zero compute/footprint impact — dead
  scratch file, not an infra concern. Not touched (ownership/intent unclear in an
  unattended pass — may be a deliberate WIP stub).
- `health_check.txt`, `AUDIT-SPEC.md`, `.hermes/plans/2026-06-10_DoD-Audit-Spec.md`,
  `new_learning/` (empty): docs/report artifacts at repo root, same build-context
  argument as above — never reach an image. No action.
- `docker-compose.yml` resource caps re-verified line by line: `db` 0.5cpu/150M,
  `redis` 0.25cpu/128M, `api` 0.5cpu/256M, `worker` 0.5cpu/192M, `frontend`
  0.25cpu/64M. All 5 services capped, matches Resource Capping protocol requirement.
- Both Dockerfiles re-verified: backend is 2-stage `python:3.12-slim` (builder w/
  gcc+libpq-dev discarded, runtime copies only `/root/.local` + `app/`), frontend is
  2-stage build→nginx with `worker_processes 1` forced (matches CPU cap). No drift.

## Files changed
None. Report-only run — infra already fully optimized from prior audits, no new
infra surface landed since 07-13, and the one open finding (langgraph landmine)
still has no safe unattended fix.
