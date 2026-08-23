#!/usr/bin/env bash
# Run Core Insight without building app images (only Postgres in Docker).
# Use when `docker-compose up --build` fails to pull from Docker Hub.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Starting PostgreSQL only..."
docker compose up postgres -d

echo "Waiting for Postgres..."
until docker compose exec -T postgres pg_isready -U coreinsight >/dev/null 2>&1; do
  sleep 1
done

export DATABASE_URL="${DATABASE_URL:-postgres://coreinsight:coreinsight_secret@localhost:5432/coreinsight}"
export JWT_SECRET="${JWT_SECRET:-dev-secret-change-in-production}"
export CORS_ORIGIN="${CORS_ORIGIN:-http://localhost:3000}"
export UPLOAD_DIR="${UPLOAD_DIR:-$ROOT/backend/uploads}"
export REPORTS_DIR="${REPORTS_DIR:-$ROOT/backend/reports}"
export CHARTS_DIR="${CHARTS_DIR:-$ROOT/backend/charts}"

mkdir -p "$UPLOAD_DIR" "$REPORTS_DIR" "$CHARTS_DIR"

echo "Installing backend dependencies (may take a minute on first run)..."
(cd "$ROOT/backend" && npm install --omit=dev 2>/dev/null || npm install --omit=dev)

echo "Seeding database..."
(cd "$ROOT/backend" && node src/db/seed.js)

echo "Starting API on http://localhost:4000 ..."
(cd "$ROOT/backend" && node src/index.js) &
BACKEND_PID=$!

echo "Starting frontend on http://localhost:3000 ..."
(cd "$ROOT/frontend" && npm install && npm run dev) &
FRONTEND_PID=$!

cleanup() {
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo ""
echo "Core Insight (local mode)"
echo "  Portal: http://localhost:3000"
echo "  API:    http://localhost:4000/api"
echo "  Login:  admin@coreinsight.local / admin123"
echo "Press Ctrl+C to stop."
wait
