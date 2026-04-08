#!/usr/bin/env bash
set -euo pipefail

# ─── Check Docker is running ───
if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running. Please start Docker Desktop and try again." >&2
  exit 1
fi

# ─── Check .env file exists ───
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo "Created .env from .env.example."
  fi
  echo "Please fill in your settings in .env, then re-run ./start.sh"
  exit 1
fi

# ─── Build and start all services ───
echo "Building and starting OutboundEngine services..."
docker compose up --build -d

# ─── Wait for API to be healthy ───
echo "Waiting for API to be ready..."
MAX_WAIT=60
ELAPSED=0
until curl -sf http://localhost:8000/health > /dev/null 2>&1; do
  if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
    echo "Error: API did not become healthy within ${MAX_WAIT}s." >&2
    echo "Check logs with: docker compose logs api" >&2
    exit 1
  fi
  sleep 3
  ELAPSED=$((ELAPSED + 3))
done
echo "API is healthy."

# ─── Run database migrations ───
echo "Running database migrations..."
docker compose exec api alembic upgrade head

# ─── Success ───
echo ""
echo "✓ OutboundEngine is running!"
echo ""
echo "  Frontend:  http://localhost:3000"
echo "  API:       http://localhost:8000"
echo "  API Docs:  http://localhost:8000/docs"
echo ""
echo "Run ./stop.sh to shut down."
