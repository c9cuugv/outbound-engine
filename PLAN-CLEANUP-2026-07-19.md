# OutboundEngine — Cleanup & Frontend Rebuild Plan

**Created:** 2026-07-19
**Branch strategy:** all work on `chore/cleanup-2026-07` → PR → `main`. No history rewrite, no force-push.
**Prime directive:** the project must work and must not break. Backend is the asset — clean it, do not rewrite it. Frontend is the liability — tear it down and rebuild.

## Execution status

| Phase | Status | Commit |
|---|---|---|
| 0 — Discovery | ✅ complete | findings below |
| 1 — Repo hygiene | ✅ complete | `87aa49e` safety, `8a03246` cleanup |
| 2 — Backend stabilisation | ✅ complete | `43b2226` |
| 3 — Frontend teardown & design foundation | 🟡 `docs/DESIGN.md` written; CSS + primitives not started | — |
| 4 — Page rebuild | ⬜ not started | — |
| 5 — E2E & verification | ⬜ not started | — |

**Verified green at `43b2226`:** pytest 221 passed / 0 failed (44.1s) · `tsc --noEmit` exit 0 · `app.main` imports, 48 routes · `git status` clean.

### ⚠️ Sequencing constraint discovered during Phase 3 prep

`src/styles/globals.css` **cannot be replaced on its own.** Every existing page
references the old Material-3 token names (`bg-surface-container`,
`text-on-surface-variant`, `text-primary-fixed`, …). Swapping the token layer
before the components that consume it breaks the build immediately.

The new `globals.css`, the `src/components/ui/` primitives, and `AppLayout` +
`Sidebar` must therefore land **in one commit**. Only then can Phase 4 rebuild
pages one at a time against a stable token layer. Do not start Phase 3 by
deleting the CSS.

---

## Phase 0 — Discovery findings (ground truth, verified 2026-07-19)

Everything below was measured, not assumed. Later phases must not contradict it.

### What actually works

| Fact | Evidence |
|---|---|
| Backend imports clean, 48 routes registered | `python -c "from app.main import app"` → `IMPORT_OK routes=48` |
| Backend test suite **221 passed, 0 failed, in 66.76s** | `pytest tests/ -q` → `221 passed, 196 warnings in 66.76s` |
| Frontend typechecks clean | `npx tsc --noEmit` → `TSC_EXIT=0` |
| No `venv/` or `node_modules/` tracked in git | `git ls-files \| grep -cE '(venv\|node_modules)/'` → `0` |
| 10 routers wired | `app/main.py:63-72` |

**Conclusion: the backend is not broken.** It is buried under junk. Treat it as a working system that needs hygiene, not a rewrite.

### Confirmed defects

**D1 — ~~pytest suite hangs at ~97%~~ — RETRACTED.** This was my error: I read a partial log mid-run and reported a hang. The suite in fact completes cleanly — `221 passed, 196 warnings in 66.76s`. There is no hang. Recorded here rather than deleted, because Phase 2 was originally scoped around a defect that does not exist.

**D1a — no pytest config exists at all.** `pytest` reports `inifile: None`. There is no `pytest.ini`/`[tool.pytest]` section, so there is no shared timeout, no default options, and no protection against a *future* hang. `pytest-timeout` is not installed (`--timeout` → `unrecognized arguments`). Preventive, not corrective.

**D1b — pytest-asyncio deprecation.** `asyncio_default_fixture_loop_scope` is unset; this becomes a behaviour change in a future release. 196 warnings in the run.

**D2 — Frontend has two design systems stacked on each other.** `src/styles/globals.css` is a machine-dumped Material-3 token set (`--color-on-tertiary-fixed-variant`, `--color-secondary-fixed-dim`, …) labelled in a comment as "GitHub Primer Dark" — the comment and the tokens disagree. Below it sits a `/* Legacy variable mappings to support old components */` block aliasing the old system. This is *the* reason the UI reads as incoherent: it has no single visual identity.

**D3 — Tokens are bypassed anyway.** 37 hardcoded hex colors sit in three pages (`CampaignDashboard.tsx` ×21, `LeadTable.tsx` ×12, `EmailReviewQueue.tsx` ×4), plus 6 inline `style={{}}` escapes and 58 className strings over 120 chars.

**D4 — Repo is polluted.** 26 modified + 35 untracked paths. Junk inventory:
- 11 × `PERF-AUDIT-2026-*.md` — auto-generated daily cron spam, root level
- `new_learning/outbound-engine/backend/app/` — **a recursive partial copy of the repo inside itself**
- `outbound_engine/tasks.py` — orphan module, shadows the real package name
- 7 × `frontend/tests/e2e/features/temp_lead_*.csv` — E2E fixtures never cleaned up
- `test_api.py` (root), `backend/test_quick_draft.py` — tests outside any test dir
- `health_check.txt`, `api.log`, `.hermes/`, `playwright-transform-cache-502/`, `.DS_Store` ×4
- `.claude/worktrees/hungry-chandrasekhar-201cb4/` — stale worktree holding a full second copy of the tree

**D5 — `.gitignore` (66 lines) does not cover the junk it needs to.** It ignores `.planning/`, `.playwright-mcp/`, `security-audit-report.md` — yet all three are *already tracked*, so the ignore rules are inert. Meanwhile `PERF-AUDIT-*.md`, `temp_lead_*.csv`, `.hermes/`, `*.DS_Store` are unignored.

**D6 — E2E fixtures write into the repo.** The `temp_lead_*.csv` accumulation proves specs create files in `tests/e2e/features/` and never delete them. Rebuilding the frontend without fixing this just regenerates the mess.

### Known product gaps (from `objective.md` — not defects, unbuilt scope)

1. Scraper is BeautifulSoup-only; dies on JS-heavy sites, Cloudflare, CAPTCHAs.
2. Email delivery runs `ConsoleProvider`; live send needs Resend/SendGrid keys.
3. Reply classification (IMAP) disabled by default; needs credentials.

**These are explicitly out of scope for this plan.** This plan makes the existing system clean, stable, and good-looking. It does not add product surface.

### Anti-pattern guards (apply to every phase)

- **Do not rewrite the backend.** 220 passing tests are the safety net. Changes to `backend/app/` are limited to what a named defect requires.
- **Do not invent API endpoints.** The contract is `app/main.py:63-72` and the routers it imports. Read the router before calling it from the frontend.
- **Do not delete anything untracked without inspecting it first.** `new_learning/` and `outbound_engine/` look like junk and almost certainly are — confirm before `rm`.
- **Do not force-push, do not rewrite history, do not delete remote branches.** Additive git only.
- **Never commit `.env`.** It holds live `NVIDIA_API_KEY` / `GEMINI_API_KEY` / `JWT_SECRET`.

---

## Phase 1 — Repo hygiene & safety net

**Goal:** a clean `git status` and a rebuildable tree, with zero behaviour change.

### Tasks

1. Create branch `chore/cleanup-2026-07` off `device/windows`.
2. **Commit the working code first, before deleting anything.** The 26 modified + real new features (`quick_draft.py`, `ai/graphs/`, `LeadTimeline.tsx`, `timeline.ts`) are unbacked-up work. Commit them as-is so every later step is revertable.
3. Inspect then delete junk: `new_learning/`, `outbound_engine/`, `.hermes/`, `playwright-transform-cache-502/`, `health_check.txt`, `api.log`, all `.DS_Store`, all `temp_lead_*.csv`.
4. Archive the 11 `PERF-AUDIT-*.md` into `docs/audits/` (they contain real history) and stop the cron that emits them into root — or delete if the cron is already dead.
5. Relocate stray tests: root `test_api.py` and `backend/test_quick_draft.py` → `backend/tests/`, or delete if superseded by `tests/`.
6. Rewrite `.gitignore` to actually cover: `PERF-AUDIT-*.md`, `temp_lead_*.csv`, `.hermes/`, `**/.DS_Store`, `playwright-transform-cache-*/`, `playwright-report/`, `test-results/`.
7. `git rm --cached` the files that are ignored-but-tracked (`.planning/`, `.playwright-mcp/`, `security-audit-report.md`) so the ignore rules take effect.
8. Remove the stale worktree `.claude/worktrees/hungry-chandrasekhar-201cb4/` via `git worktree remove`.

### Verification checklist

- [ ] `git status --porcelain` → empty
- [ ] `git ls-files | grep -cE '(venv|node_modules)/'` → `0`
- [ ] `git ls-files | grep -c 'PERF-AUDIT'` → `0`
- [ ] `git worktree list` → one entry
- [ ] Backend still imports: `python -c "from app.main import app"` → 48 routes
- [ ] `git log --oneline` shows the pre-deletion safety commit

### Anti-pattern guards

- Do not `git add -A` blindly — `.env` must never enter a commit. Verify with `git diff --cached --name-only | grep -c '^\.env$'` → `0`.
- Do not delete `docs/`, `demo/`, `leads_sample.csv`, `.env.example`, `alembic/versions/` — all load-bearing.

---

## Phase 2 — Backend stabilisation

**Goal:** lock in a suite that is already green, so it stays that way. Small phase — the backend is healthy.

### Tasks

1. Add `backend/pytest.ini` (D1a — none exists today). Set `testpaths`, `asyncio_mode`, and `asyncio_default_fixture_loop_scope` (D1b).
2. Add `pytest-timeout` to `requirements-dev.txt` and set a default per-test timeout in the new config. **Preventive:** the suite does not hang today; this guarantees a future one fails loudly in ~67s rather than stalling CI.
3. Establish the CI budget: the suite runs in **66.76s** on this (slow, external-HDD) machine. Anything materially over that is a regression signal.
4. Triage the 196 warnings — fix the deprecations, leave the noise.

### Verification checklist

- [ ] `pytest tests/ -q` → `221 passed, 0 failed`, terminates under ~90s
- [ ] Warning count materially below 196
- [ ] No test skipped, deleted, or `xfail`ed to achieve green — `git diff tests/` reviewed
- [ ] `python -c "from app.main import app"` still → 48 routes

### Anti-pattern guards

- Do not refactor passing tests. All 221 are the safety net for Phases 3–4.
- Do not let config changes silently narrow collection — assert the count stays 221.

---

## Phase 3 — Frontend teardown & design foundation

**Goal:** one coherent design system. This is the phase that fixes "I do not like the frontend".

### What gets kept vs torn down

**Keep (proven, API-coupled, working):**
- `src/api/*` — client, leads, campaigns, analytics, lists, timeline, quickDraft
- `src/types/*` — mirror the backend schemas
- `src/hooks/*` — useLeads, useCampaigns, useWebSocket
- `src/App.tsx` routing shape + lazy/Suspense/ErrorBoundary structure (this part is sound)

**Tear down and rebuild:**
- `src/styles/globals.css` — delete the Material-3 dump *and* the legacy alias block outright
- every file in `src/pages/` and `src/components/`

### Tasks

1. **Commit to one visual identity and write it down** in `docs/DESIGN.md` before writing CSS. The current file's own comment contradicts its contents; that ambiguity is the root cause of D2.
2. Build a single token layer: one ramp of neutrals, one accent, semantic status colors (success/warn/danger/info), a type scale, a spacing scale, a radius scale. Small and enforced beats large and ignored.
3. Rebuild the primitives — Button, Card, Badge, Input, Table, Spinner, EmptyState — consuming tokens only.
4. Rebuild `AppLayout` + `Sidebar`.
5. Delete `framer-motion` if the rebuild does not genuinely use it. It currently powers one 150ms opacity fade.

### Verification checklist

- [ ] `grep -rE '#[0-9a-fA-F]{3,8}' src --include='*.tsx' | wc -l` → `0` (D3 resolved)
- [ ] `grep -rc 'style={{' src --include='*.tsx' | grep -v ':0'` → empty (D3 resolved)
- [ ] `grep -c 'Legacy variable mappings' src/styles/globals.css` → `0` (D2 resolved)
- [ ] `npx tsc --noEmit` → exit 0
- [ ] `npm run build` → exit 0
- [ ] `docs/DESIGN.md` exists and names the identity

### Anti-pattern guards

- **Do not port the old tokens forward.** Carrying `--color-on-tertiary-fixed-variant` into the new system rebuilds D2.
- **Do not invent backend fields.** Read `src/types/*` and the matching router before rendering a field.
- Do not add a component library mid-rebuild. Tailwind 4 + the primitives above is the stack.

---

## Phase 4 — Frontend page rebuild

**Goal:** every route works against the real API, one vertical slice at a time.

Rebuild in dependency order, each slice merged working before the next starts:

1. `LoginPage` — auth is the gate for everything else
2. `LeadTable` (530 LOC → target well under) + `ResearchPanel`
3. `CampaignList`
4. `CampaignBuilder` — the 738-LOC 4-step wizard, the biggest file in the codebase
5. `EmailReviewQueue`
6. `CampaignDashboard`
7. `LeadTimeline`
8. `QuickDraft`

### Per-slice verification (all must pass before the next slice)

- [ ] `npx tsc --noEmit` → exit 0
- [ ] `npm run build` → exit 0
- [ ] Route renders against the running backend with real data, not mocks
- [ ] Loading, empty, and error states all exist
- [ ] Zero hardcoded hex, zero inline `style={{}}`

### Anti-pattern guards

- Do not rebuild all eight pages then test. One slice, verified, merged.
- Do not change a backend endpoint to suit the UI. The API contract is fixed in this plan; if a genuine mismatch appears, record it and raise it rather than silently editing a router.
- Do not let a slice regress a passing backend test.

---

## Phase 5 — E2E, verification, documentation

**Goal:** prove it works end to end, and make that proof repeatable.

### Tasks

1. Rewrite the 8 E2E specs against the new UI, using role/text selectors (the existing suite already learned this lesson — keep it).
2. **Fix D6:** E2E fixtures must be created in a temp dir and cleaned up in `afterAll`. Verify no `temp_lead_*.csv` appears in the repo after a full run.
3. Full-stack smoke: `docker compose up` → register → import CSV → research a lead → build a campaign → generate drafts → review → send via ConsoleProvider.
4. Rewrite `README.md` to match reality: real setup steps, real env vars, real commands.
5. Delete the now-stale `NOT_WORKING.md` and `objective.md` status claims, or update them — several assertions in them are already contradicted by Phase 0 findings.
6. Open the PR to `main`.

### Final verification checklist

- [ ] `pytest tests/ -q` → 221 passed, 0 failed
- [ ] `npx tsc --noEmit` → exit 0
- [ ] `npm run build` → exit 0
- [ ] `npx playwright test` → all specs pass
- [ ] `git status --porcelain` after a full E2E run → empty (D6 resolved)
- [ ] `docker compose up` → all 5 services healthy
- [ ] Manual smoke path completes end to end
- [ ] `grep -rE '#[0-9a-fA-F]{3,8}' frontend/src --include='*.tsx' | wc -l` → `0`
- [ ] README steps followed from scratch actually work

---

## Out of scope (deliberately)

- Headless-browser scraping / proxy network (product gap 1)
- Live email delivery keys (product gap 2)
- IMAP OAuth2 (product gap 3)
- Backend architectural rewrite — explicitly rejected; 220 passing tests say the structure is sound
- Git history rewriting — unnecessary, and irreversible if wrong

## Risk register

| Risk | Mitigation |
|---|---|
| Frontend rebuild breaks a working API integration | `src/api/*` and `src/types/*` are explicitly *kept*; slices verified against a live backend |
| Deleting junk removes something load-bearing | Phase 1 commits working code *before* any deletion; everything is revertable |
| External HDD makes every command slow | Expect long test/build runs. **This already caused one false diagnosis** (retracted D1): a partial log was read mid-run and reported as a hang. Let commands finish before concluding. |
| The rebuild scope grows into the three product gaps | They are listed under "Out of scope" and stay there; this plan ships clean + working, not new features |
