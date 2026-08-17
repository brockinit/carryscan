#!/usr/bin/env bash
# Idempotent one-time bootstrap for the CarryScan Cloud Agent environment.
# Provisions system deps (PostgreSQL 16 + TimescaleDB, python venv), installs
# JS/Python project deps, initializes the local database, and applies migrations.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PG_VER=16
DB_USER=carryscan
DB_PASS=carryscan
DB_NAME=carryscan
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}"

log() { printf '\n\033[1;36m[install]\033[0m %s\n' "$*"; }

# --- System packages (only when missing; no-op on a warm snapshot) -----------
if ! command -v psql >/dev/null 2>&1 || ! ls /usr/lib/postgresql/${PG_VER} >/dev/null 2>&1; then
  log "Installing PostgreSQL ${PG_VER}"
  export DEBIAN_FRONTEND=noninteractive
  sudo apt-get update -qq
  sudo apt-get install -y -qq "postgresql-${PG_VER}" "postgresql-client-${PG_VER}"
fi

if [ ! -f /usr/lib/postgresql/${PG_VER}/lib/timescaledb.so ]; then
  log "Installing TimescaleDB for PostgreSQL ${PG_VER}"
  export DEBIAN_FRONTEND=noninteractive
  curl -fsSL https://packagecloud.io/timescale/timescaledb/gpgkey \
    | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/timescaledb.gpg
  echo "deb https://packagecloud.io/timescale/timescaledb/ubuntu/ $(. /etc/os-release && echo "$VERSION_CODENAME") main" \
    | sudo tee /etc/apt/sources.list.d/timescaledb.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq "timescaledb-2-postgresql-${PG_VER}" timescaledb-tools
  sudo timescaledb-tune --quiet --yes \
    --pg-config="/usr/lib/postgresql/${PG_VER}/bin/pg_config" >/dev/null
fi

# `python3 -m venv --help` succeeds even when ensurepip is absent, so probe
# ensurepip directly — that is what actually breaks venv creation.
if ! python3 -c "import ensurepip" >/dev/null 2>&1; then
  log "Installing python venv support"
  export DEBIAN_FRONTEND=noninteractive
  sudo apt-get update -qq
  sudo apt-get install -y -qq python3-venv python3-pip
fi

# --- Local env file ----------------------------------------------------------
if [ ! -f .env ]; then
  log "Creating .env from .env.example"
  cp .env.example .env
  sed -i "s#^DATABASE_URL=.*#DATABASE_URL=${DATABASE_URL}#" .env
fi

# --- Database: start, ensure role/db, migrate --------------------------------
log "Starting PostgreSQL and ensuring database"
sudo pg_ctlcluster "${PG_VER}" main start 2>/dev/null || true
for _ in $(seq 1 30); do
  pg_isready -h localhost -U postgres >/dev/null 2>&1 && break
  sleep 1
done

sudo -u postgres psql -v ON_ERROR_STOP=1 -tAc \
  "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c \
    "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}' SUPERUSER"

sudo -u postgres psql -v ON_ERROR_STOP=1 -tAc \
  "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"

# --- JS dependencies ---------------------------------------------------------
log "Installing web dependencies"
npm ci --prefix apps/web

log "Installing ingest dependencies"
npm ci --prefix services/ingest

log "Applying database migrations"
DATABASE_URL="${DATABASE_URL}" npm run migrate --prefix services/ingest

# --- Python (spy_lab) --------------------------------------------------------
log "Installing spy_lab (Python) dependencies"
python3 -m venv services/spy_lab/.venv
services/spy_lab/.venv/bin/pip install -q --upgrade pip
services/spy_lab/.venv/bin/pip install -q -e "services/spy_lab[dev]"

log "Bootstrap complete"
