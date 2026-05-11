#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-3120}"

echo "Restarting Next.js cleanly on port ${PORT}..."

PIDS="$(lsof -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "${PIDS}" ]; then
  echo "Stopping existing process on port ${PORT}: ${PIDS}"
  kill ${PIDS} 2>/dev/null || true
  sleep 1
fi

if [ -d ".next" ]; then
  echo "Clearing stale .next build cache"
  rm -rf .next
fi

exec npm run dev -- -p "${PORT}"
