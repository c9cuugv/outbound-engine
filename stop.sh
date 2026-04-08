#!/usr/bin/env bash
set -euo pipefail

echo "Stopping OutboundEngine..."
docker compose down

read -rp "Remove persistent data volumes? (y/N) " answer
if [[ "$answer" == "y" || "$answer" == "Y" ]]; then
  docker compose down -v
fi

echo "Stopped."
