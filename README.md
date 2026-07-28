# CarryScan

Reference page for funding & basis on Hyperliquid HIP-3 equity/index perps (`xyz` dex).

## Stack

- **apps/web** — Next.js 14 (App Router, TypeScript, Tailwind, SWR, TanStack Table)
- **services/ingest** — Node 20 + TypeScript worker (node-cron, pg, fetch)
- **db** — TimescaleDB (Postgres 16)
- Docker Compose (+ optional Caddy)

No Python. Metrics, ingest, and UI are all TypeScript.

## Quick start

```bash
cp .env.example .env
# optional: MASSIVE_API_KEY for cash closes (earnings fall back to db/seed/earnings.csv)

make dev          # db + ingest + web on :3000
make backfill     # funding + candles + closes + nightly metrics
```

Open http://localhost:3000 — detail pages at `/m/xyz%3ATSLA`.

## Local (without Docker for web)

```bash
docker compose up -d db
cd services/ingest && npm i && npm start          # scheduler
# other terminal:
cd services/ingest && npm run backfill
cd apps/web && npm i && npm run dev
```

## API

| Route | Purpose |
|---|---|
| `GET /api/markets` | Dashboard payload |
| `GET /api/markets/:coin` | Detail (URL-encode colon) |
| `GET /api/health` | Job heartbeats |

## Hyperliquid fields (verified at build)

`metaAndAssetCtxs` asset contexts use: `markPx`, `oraclePx`, `midPx`, `funding`, `openInterest`, `prevDayPx`, `dayNtlVlm`, `premium`. Funding history: `fundingRate`, `premium`, `time`.

## Tests

```bash
make test   # vitest golden metrics + web typecheck/lint/build
```

## Deploy

Target: single host. `make deploy` → `git pull && docker compose up -d --build`. Enable Caddy with `docker compose --profile prod up -d`.
