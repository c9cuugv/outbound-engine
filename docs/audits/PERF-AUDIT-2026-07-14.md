# Perf/Efficiency Audit — 2026-07-14

## Scope
Infra (docker-compose.yml, Dockerfiles) still fully optimized from prior audits — no
change needed there. This run covers new surface since 07-13: `backend/app/ai/graphs/`
(email_gen_graph.py, research_graph.py, reply_graph.py) + their tests, plus new frontend
pages (LeadTimeline.tsx, QuickDraft.tsx) and `analytics.py`'s `/timeline` endpoint.

## Finding: unwired langgraph/langchain-core dep — landmine, not yet a cost (no fix applied)
All 3 files in `app/ai/graphs/` import `langgraph.graph`, `langgraph.checkpoint.memory`,
`langchain_core.runnables`. Neither `langgraph` nor `langchain-core` is pinned in
`backend/requirements.txt` — confirmed via grep, zero matches. `pip show langgraph`
resolves locally (dev env has it), but the Docker build (`pip install --user
--no-cache-dir -r requirements.txt`) would NOT install it. Grepped `app/api`, `app/workers`,
`app/services` — zero references to `app.ai.graphs`. Nothing imports these modules today,
so no container currently breaks and no compute is spent on them.

Two risks stacked here:
1. **Landmine**: first route/worker task that imports `app.ai.graphs.*` in prod → `ImportError`,
   crashes that worker/request. Silent until wired in.
2. **Compute Conservation conflict**: `quick_draft.py` (91 lines, same file) already does
   scrape → prompt → `safe_generate` → response with plain async functions, no framework.
   The graphs/ modules solve the same shape of problem (linear-ish state machine, 3-5 nodes)
   with `langgraph`+`langchain-core`, both heavier deps pulling their own transitive tree
   (pydantic internals, tenacity, etc.) — exactly the "avoid heavy libraries when a
   lightweight alternative exists" case the protocol flags.

**No fix applied.** Adding the two packages to requirements.txt to "fix" the import would
itself violate Compute Conservation (bakes the heavy dep into every build). Ripping out an
in-progress feature's chosen framework is a product decision outside an unattended infra
pass (same call made in the 07-13 audit for the multi-provider SDK stack). Flagging for the
person who owns this feature to pick one of: (a) pin the two deps now and accept the
weight, (b) port the 3 graphs to plain async functions matching `quick_draft.py`'s pattern
before wiring them into any route.

## Reviewed, no change needed
- `research_graph.py::scrape_pages`: bounded (10s timeout, 7 fixed paths, parallel
  `asyncio.gather` with `return_exceptions=True`) — but duplicates
  `app/services/scraper.py::CompanyScraper` used by `quick_draft.py`. Worth deduping onto
  one scraper when this graph gets wired in, so the container only ships one scrape impl.
  Not touched — same "unwired, no active cost" reasoning as above.
- `MemorySaver()` checkpointer in all 3 graphs: in-memory, no eviction — each already has
  a `# TODO: Use PostgresSaver in production` from the author. Real memory-growth risk on
  the 512MB-capped `api`/`worker` containers once wired in, but flagging duplicate the
  existing TODO would add noise, not value.
- `analytics.py::get_lead_timeline`: single query (`GeneratedEmail` by lead+campaign),
  in-memory sort — no N+1, no fix needed.
- `LeadTimeline.tsx` / `timeline.ts`: 3 independent `useQuery` calls, no polling
  (`refetchInterval` unset) — no unnecessary server load.
- docker-compose.yml / both Dockerfiles: unchanged since 07-13, still slim/alpine,
  multi-stage, per-service cpu/mem caps.

## Files changed
None. Report-only run — no safe, narrow infra fix identified this cycle; the one real
finding is a feature-scope tradeoff, not an infra knob.
