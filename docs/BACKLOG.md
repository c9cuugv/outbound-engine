# Backlog

This is the **only file you need to touch.** Add a feature or fix as a one-line
task; the autonomous pipeline (see `docs/PIPELINE.md`) picks the topmost
unchecked task each run, builds it test-first, and merges it only if every gate
is green.

## How to add work

- Add a line under **Queue** as `- [ ] <short imperative task>`.
- Put the most important task at the **top** — the pipeline always takes the
  topmost `- [ ]`.
- Keep each task small enough to finish and test in one run (one endpoint, one
  page, one fix). Split big things into steps.
- One line, plain English. Add a short "Acceptance:" clause if the done-state
  isn't obvious.

Status markers (the pipeline updates these — you don't have to):
`- [ ]` todo · `- [~]` in progress · `- [x]` done · `- [!]` blocked (see log)

## Queue

<!-- Add tasks below this line. Example (delete once you add real ones): -->
- [~] Add a "Settings" page where the user can edit sender name and default sending window. Acceptance: form persists via the existing campaign fields; page reachable from the sidebar.

## Done

<!-- The pipeline moves completed tasks here with their PR link. -->

## Blocked

<!-- The pipeline moves tasks it couldn't finish here, each with a reason + branch. -->
