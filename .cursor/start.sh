#!/usr/bin/env bash
# Per-boot reconciliation: bring up PostgreSQL/TimescaleDB and apply any new
# migrations. Idempotent and safe to run repeatedly. Long-running app servers
# live in `terminals`, not here.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PG_VER=16
DATABASE_URL="postgresql://carryscan:carryscan@localhost:5432/carryscan"

log() { printf '\n\033[1;36m[start]\033[0m %s\n' "$*"; }

log "Starting PostgreSQL cluster ${PG_VER}/main"
sudo pg_ctlcluster "${PG_VER}" main start 2>/dev/null || true

for _ in $(seq 1 30); do
  pg_isready -h localhost -U carryscan -d carryscan >/dev/null 2>&1 && break
  sleep 1
done

if ! pg_isready -h localhost -U carryscan -d carryscan >/dev/null 2>&1; then
  echo "[start] ERROR: PostgreSQL did not become ready" >&2
  exit 1
fi

log "Applying database migrations (idempotent)"
DATABASE_URL="${DATABASE_URL}" npm run migrate --prefix services/ingest

log "Database ready at ${DATABASE_URL}"
