# DoD Audit Spec — OutboundEngine-Execution-Plan.md

Decisions locked via /grill-me interview, 2026-06-10.

## Verdict model
- **Scope**: all 28 stories vs original DoD. Parked surfaces (NOT_WORKING.md) = **FAIL**, no mercy tier.
- **Trees**: audit BOTH `main` and `device/windows` working tree (dirty, includes quick_draft + graphs + restored worker). Report diff verdicts per story.
- **Evidence**: full runtime verification incl. perf benchmarks:
  - seed 1000 leads → lead list `<200ms`
  - 10K-row CSV import, no timeout
  - tracking pixel `<50ms`
  - analytics `<500ms` @ 1000 leads
  - websocket event `<2s`
  - workers: real generation runs (rate limits observed, volume per DoD where feasible)
- Static-only criteria (prompt char limits, schema tests, anti-buzzword lists) verified via code + pytest.

## Environment
- Working tree audited against the **running stack** (api/db/redis/worker/frontend, compose project `outbound-engine`).
- `main` audited via **git worktree + isolated compose project** (offset ports, own volumes). Live stack untouched.
- DB: benchmark data seeded into live dev DB, **kept** (no cleanup; serves as future fixtures).

## AI calls
- LLM via user's local proxy: `http://localhost:3001/v1` (OpenAI-compatible; chat `/v1/chat/completions`, model `auto`). From containers: `http://host.docker.internal:3001/v1`.
- Route through NVIDIA provider path: set `NVIDIA_BASE_URL` env. Known gap: `app/ai/providers.py:171` hardcodes class constant — wire to `config.NVIDIA_BASE_URL` if not already read (audit item M1-1).
- Email sends: **ConsoleProvider only**. No real SMTP.

## UI stories
- UI-A..D verified via Playwright E2E (existing specs + manual browser checks via MCP if specs missing).

## Output
- `AUDIT-REPORT.md` at repo root. Per story: ID | DoD criterion | main verdict | WIP verdict | evidence | gap notes.
- Appendix: unplanned additions (LangGraph graphs, quick_draft API/page, live_flow spec) — inventoried, not graded.

## Known contradictions to resolve in report
1. NOT_WORKING.md says Celery removed; running stack has healthy `worker-1` (working-tree compose re-added it). Doc stale vs WIP.
2. Plan tracker shows 0/28; all owned files exist.
3. `app/workers/*.py` exist on disk despite "moved out of active app" claim.
