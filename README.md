# CarryScan

Reference page for funding, basis, and positioning on Hyperliquid HIP-3 equity/index perps (all HIP-3 dexs, not only `xyz`).

## Stack

- **apps/web** — Next.js 14 (Vercel)
- **services/ingest** — Node 20 worker (Fly / Railway / Docker)
- **db** — TimescaleDB (managed in prod; Docker locally)

## Quick start (local)

```bash
cp .env.example .env
# optional: MASSIVE_API_KEY, IBKR_FLEX_*, HL_WATCH_ADDRESS

make dev          # db + ingest + web on :3000
make migrate      # apply db/migrations (000 + 001…)
make backfill     # discover + funding + candles + closes + nightly
```

Open http://localhost:3000 — detail at `/m/xyz%3ATSLA`, weekly at `/weekly`.

## Production architecture

| Piece | Where |
|---|---|
| Web | Vercel — set **remote** `DATABASE_URL` (never localhost) |
| Ingest | Fly (`services/ingest/fly.toml`) or Railway (`railway.toml`) |
| DB | Timescale Cloud (preferred) or Neon + Timescale |

### One-time setup

1. Create a Timescale service; copy the connection string.
2. From a machine with network access:

```bash
export DATABASE_URL='postgresql://…'
cd services/ingest && npm i && npm run migrate
npm run backfill   # long; needs MASSIVE_API_KEY for cash closes
```

3. Deploy ingest (example Fly):

```bash
fly apps create carryscan-ingest   # once
fly secrets set DATABASE_URL=… MASSIVE_API_KEY=… IBKR_FLEX_TOKEN=… IBKR_FLEX_QUERY_ID=… HL_WATCH_ADDRESS=…
fly deploy --config services/ingest/fly.toml --dockerfile services/ingest/Dockerfile
```

4. In Vercel project env: same `DATABASE_URL`, optional `HL_WATCH_ADDRESS`, `HL_INFO_URL`.
5. Confirm `GET /api/health` → `mode` is not live-only, and `GET /api/markets` has `"live_mode": false` with stress/gaps after nightly.

Ingest runs `migrate` on boot, then cron (ET): snapshot, funding, candles, margin, closes, borrow, discover, earnings, nightly.

## IBKR Flex borrow

1. Client Portal → Flex Queries → enable Flex Web Service → token.
2. Create a query including **Borrow Fee Details** (and HTB sections if available).
3. Set `IBKR_FLEX_TOKEN` + `IBKR_FLEX_QUERY_ID` on ingest.

Flex rates apply to names you short (or HTB sections your account exposes). For long-cash hedge cost without shorts, drop a blotter at `db/seed/borrow.csv` (`ticker,fee_rate_pct,as_of`) or set `BORROW_CSV`. UI badges: `ibkr` / `csv` / `ind`.

## HL margin strip

Set `HL_WATCH_ADDRESS` (public address only). Ingest snapshots `clearinghouseState` per HIP-3 dex; dashboard shows account cushion + tightest liq distance when positions exist. `GET /api/risk`.

## Weekly report (site only)

```bash
make weekly
# or: ./scripts/weekly-publish.sh   # generate + commit + push main
```

Writes `apps/web/content/weekly/YYYY-MM-DD.json`. Commit + push to `main` for Vercel. Sample placeholder: `apps/web/content/weekly/2026-07-25.json`.

**Sunday Cursor Automation (~18:00 ET):** checkout this repo on `main`, run `PUBLIC_BASE_URL=https://carryscan.vercel.app npm run weekly --prefix services/ingest`, commit only the new/updated JSON under `apps/web/content/weekly/`, push `main` (Vercel deploys `/weekly`). No email/webhooks.

## API

| Route | Purpose |
|---|---|
| `GET /api/markets` | Dashboard (+ positioning, basis term, borrow source) |
| `GET /api/markets/:coin` | Detail |
| `GET /api/risk` | Watch-wallet margin / liq |
| `GET /api/weekly` | Published scorecards |
| `GET /api/health` | Job heartbeats |

## Tests

```bash
make test
```

## Env

See [`.env.example`](.env.example).
