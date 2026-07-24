# Autonomous feature pipeline

A scheduled agent runs this loop on a cadence so the project advances without
supervision. You add features to `docs/BACKLOG.md`; the pipeline delivers them
via PRs that **auto-merge only when every gate is green**, and quarantines
anything it can't make green. It never merges red and never touches `main`
except through a green PR.

This file is both the human doc and the agent's operating contract. The
scheduled routine's prompt is: *"Follow docs/PIPELINE.md exactly."*

## The loop (one task per run)

1. **Sync.** `git fetch`, check out `main`, fast-forward to `origin/main`. If the
   working tree is dirty, stop and log — never build on an unknown state.
2. **Pick.** Read `docs/BACKLOG.md`. Take the **topmost `- [ ]`** task. If there
   is none, exit cleanly (do not invent work). Mark it `- [~]` in a first commit
   on a new branch `auto/<slug>` off `main`.
3. **Build test-first (TDD).**
   - Backend: write a failing `pytest` test, then the minimal code to pass, then
     refactor. Follow existing patterns in `backend/app/`.
   - Frontend: build against the design system in `docs/DESIGN.md` — tokens only,
     no hardcoded hex, no inline `style={{}}`, primitives from
     `src/components/ui/`. Add/extend a mocked Playwright spec.
4. **Gate — all must pass, in this order:**
   ```
   cd backend  && ./venv/bin/python -m pytest -q          # was 224, must not drop
   cd frontend && npx tsc --noEmit
   cd frontend && npm run build
   cd frontend && npx playwright test features/           # mocked suite, was 18
   ```
   The `backend/pytest.ini` per-test `timeout=60` means a hang fails fast and
   named — treat any timeout as a red gate to fix, never to skip.
5. **Deliver.**
   - **All green** → commit, push `auto/<slug>`, open a PR, **auto-merge** it into
     `main` (squash), move the task to **Done** in `BACKLOG.md` with the PR link.
   - **Still red after 3 fix attempts** → stop. Push the branch, open a PR left
     open (do not merge), move the task to **Blocked** in `BACKLOG.md` with a
     one-line reason, and append the failure detail to `docs/PIPELINE-LOG.md`.
6. **Log.** Append one line to `docs/PIPELINE-LOG.md`: date, task, outcome, PR.
7. Exit. The next scheduled run takes the next task.

## Hard guardrails (never violate)

- **Never merge a red gate.** Green is the only path to `main`.
- **One task per run.** Bounded scope, bounded cost. Do not chain tasks.
- **Branch only.** All work on `auto/<slug>`; `main` changes only via a merged
  green PR. Never commit directly to `main`, never force-push, never rewrite
  history, never delete remote branches.
- **No scope creep.** Touch only what the task needs. No opportunistic refactors,
  no dependency bumps, no reformatting unrelated files.
- **Never delete or overwrite the safety branch** `feature/stitch-design`.
- **Never weaken the suite to go green** — no `skip`, `xfail`, `--ignore`,
  deleting tests, or loosening assertions to pass. Fix the code.
- **Secrets stay out of git.** Never commit `.env` or any key.
- **Empty backlog = do nothing.** Don't manufacture tasks.

## What you (the human) do

- Add features to `docs/BACKLOG.md`. That's it.
- Skim `docs/PIPELINE-LOG.md` when you want to see what shipped.
- Check **Blocked** in the backlog if something stalls — each has a reason and a
  branch you can pick up.

## First run

Watch the first scheduled run once to confirm the environment can install deps
and run the gate (backend venv, `npm ci`, `npx playwright install`). After that
it is hands-off.
