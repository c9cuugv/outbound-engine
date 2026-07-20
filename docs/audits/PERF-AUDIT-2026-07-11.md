# Efficiency Audit — 2026-07-11

## Verdict: COMPLIANT — no infra changes required (unchanged since 2026-07-10 audit)

`docker-compose.yml`, `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`, `backend/app/workers/celery_app.py` — byte-identical to state reviewed 2026-07-10. No infra drift. No write action taken.

---

## Checklist (re-verified, no change from 07-10)

### Docker Images
| Service | Image | Status |
|---------|-------|--------|
| db | `postgres:16-alpine` | ✅ Alpine |
| redis | `redis:7-alpine` | ✅ Alpine |
| api | `python:3.12-slim` multi-stage, non-root `appuser` | ✅ Slim + multi-stage + hardened |
| worker | reuses `outbound-engine-api` | ✅ No extra build |
| frontend | `node:22-alpine` → `nginx:stable-alpine` | ✅ |

### Resource Caps (total 790M / 1GB VPS — 234M headroom)
| Service | CPU | RAM |
|---------|-----|-----|
| db | 0.5 | 150M |
| redis | 0.25 | 128M |
| api | 0.5 | 256M |
| worker | 0.5 | 192M |
| frontend | 0.25 | 64M |

### Compute Conservation
- uvicorn `--workers 1 --loop uvloop --no-access-log --limit-max-requests 1000` ✅
- celery `--pool=solo --concurrency=1 --without-gossip --without-mingle --without-heartbeat` ✅
- redis `maxmemory 96mb --maxmemory-policy allkeys-lru --hz 5` ✅
- postgres `max_connections=20 shared_buffers=64MB` ✅

### Frontend
Static via nginx, gzip pre-compressed assets, `expires 1y immutable` — unchanged ✅

---

## New Finding — Out of Protocol Scope (flagging only, not fixing here)

New untracked code since last audit: `backend/app/ai/graphs/` (`research_graph.py`, `reply_graph.py`, `email_gen_graph.py`) and `backend/app/api/v1/quick_draft.py`.

All three graph modules `import langgraph.graph`, `langgraph.checkpoint.memory`, `langchain_core.runnables` — **neither `langgraph` nor `langchain-core` is present in `backend/requirements.txt`**. Container build/runtime will `ImportError` on any code path that touches these graphs. This is a correctness/deployment gap, not a compute-efficiency issue, so it's outside this protocol's remit — not adding the deps here (also: `langchain`/`langgraph` pull a nontrivial dependency tree, worth a deliberate review rather than a drive-by add under a cost-conservation task). Flagged for separate fix.

## No Action Required (protocol scope)
Infra matches protocol target state. Next audit: 2026-07-12.
