# Efficiency Audit — 2026-07-10

## Verdict: COMPLIANT — no new changes required (uncommitted hardening exceeds protocol baseline)

Working tree already contains an unstaged infra-hardening pass (not authored this run) on top of the 2026-06-18 audit baseline. Reviewed it against protocol — fully satisfies + exceeds requirements. No write action taken per scheduled-task scope (audit → report only).

---

## Checklist

### Docker Images
| Service | Image | Status |
|---------|-------|--------|
| db | `postgres:16-alpine` | ✅ Alpine |
| redis | `redis:7-alpine` | ✅ Alpine |
| api | `python:3.12-slim` multi-stage, non-root `appuser` | ✅ Slim + multi-stage + hardened |
| worker | reuses `outbound-engine-api` | ✅ No extra build |
| frontend | `node:22-alpine` → `nginx:stable-alpine`, gzip pre-compress in build | ✅ |

### Resource Caps (total 790M / 1GB VPS headroom OK — 234M free for host+daemon)
| Service | CPU | RAM | Δ since 06-18 |
|---------|-----|-----|-----|
| db | 0.5 | 150M | unchanged |
| redis | 0.25 | 128M | unchanged |
| api | 0.5 | 256M | unchanged |
| worker | 0.5 | 192M | ↑ from 128M (solo pool + time-limits need headroom) |
| frontend | 0.25 | 64M | unchanged |

### Compute Conservation
- uvicorn: `--workers 1 --loop uvloop --no-access-log --limit-max-requests 1000` ✅
- celery: `--pool=solo --concurrency=1 --without-gossip --without-mingle --without-heartbeat --time-limit=300 --soft-time-limit=270` ✅ (pool=solo added since 06-18 — matches earlier session's own recommendation)
- redis: `maxmemory 96mb --maxmemory-policy allkeys-lru --hz 5` ✅ (lower hz = fewer background wakeups)
- postgres: `max_connections=20 shared_buffers=64MB effective_cache_size=96MB` ✅ (cache size trimmed down from 128MB to match new 150M cap)

### New Hardening Since 06-18 (all consistent with protocol, worth keeping)
- `security_opt: no-new-privileges:true` + `mem_swappiness: 0` + `pids_limit` on every service
- Per-service log rotation (`max-size`/`max-file`) on every service, not just some
- Network segmentation: `backend` / `frontend` bridge networks instead of one flat network — db/redis/worker no longer reachable from the frontend network
- `tmpfs` on api/worker `/tmp` (32m, mode 1777) — avoids writable container layer churn
- `ulimits.nofile` capped 1024/2048 on api/worker
- Ports bound to `127.0.0.1` only (db, api, frontend) — was previously `0.0.0.0` on frontend
- backend Dockerfile: `apt-get install --no-install-recommends`, runs as non-root `appuser`
- frontend Dockerfile: nginx `worker_processes auto` → `1` (matches the 0.25 CPU cap; auto over-provisions), `worker_connections` trimmed 1024→256, build-time gzip pre-compression of static assets

### Frontend
- Static files via nginx (not dev server) ✅
- gzip + pre-compressed `.gz` assets served ✅
- Asset cache: `expires 1y, immutable` ✅ (per nginx.conf, unchanged)

---

## Observations (informational only, outside protocol scope)
- `worker` healthcheck was changed to `os.kill(1,0)` (always succeeds if PID 1 alive) instead of pinging Redis — weaker liveness signal, but not a perf/cost concern; flagging for awareness only, not fixing under this protocol.
- All of the above changes are **unstaged** (`git status` shows modified, not committed). Recommend the user review + commit this hardening pass — it's good work sitting uncaptured in the working tree.

## No Action Required
Infrastructure matches or exceeds target state defined by protocol.
Next audit: 2026-07-11
