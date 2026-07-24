# Performance-Efficiency Audit — 2026-06-13

## Infrastructure Status: ALREADY WELL-OPTIMIZED

### Confirmed Good (no changes needed)
- Multi-stage builds: backend (python:3.12-slim → slim), frontend (node:20-alpine → nginx:alpine)
- Resource limits on ALL 5 services (db/redis/api/worker/frontend)
- Total capped: 808MB RAM, 2.0 CPUs — fits 1GB VPS with ~200MB OS headroom
- uvicorn: --workers 1 --loop uvloop (correct for single-core)
- Celery: --max-tasks-per-child=100 --prefetch-multiplier=1 --without-gossip/mingle/heartbeat
- Redis: --save "" --appendonly no (ephemeral, no disk I/O)
- Redis: maxmemory 96mb allkeys-lru (prevents OOM kill)
- Postgres: tuned shared_buffers=64MB, max_connections=20, work_mem=2MB
- Nginx: gzip enabled, static assets cached 1y, SPA fallback, security headers
- Non-root appuser in backend container
- PYTHONDONTWRITEBYTECODE/PYTHONUNBUFFERED/PYTHONOPTIMIZE set
- All ports bound to 127.0.0.1 only

## Fixes Applied

### 1. celery_app.py — result_expires=3600
**Problem:** Celery results accumulate in Redis indefinitely → hits 96MB maxmemory → allkeys-lru evicts live broker data → tasks silently fail or retry.
**Fix:** `result_expires=3600` — results auto-expire after 1h.

### 2. docker-compose.yml — Celery --pool=solo
**Problem:** prefork pool (default) spawns a subprocess even with --concurrency=1, wasting ~30MB RSS for process management overhead with zero benefit.
**Fix:** `--pool=solo` — single-threaded in-process execution, no subprocess.

### 3. nginx.conf — proxy_buffering on with limits
**Problem:** `proxy_buffering off` → Nginx holds backend connection open until slow client finishes reading → backend thread pinned → lower throughput under concurrent load. SSE/streaming endpoints can override per-response via `X-Accel-Buffering: no` header.
**Fix:** `proxy_buffering on`, `proxy_buffer_size 4k`, `proxy_buffers 8 4k`, `proxy_busy_buffers_size 8k` — backend connection released as soon as response buffered.

## Files Modified
- `backend/app/workers/celery_app.py`
- `docker-compose.yml`
- `frontend/nginx.conf`
