# SPY Edge Factory (`spy_lab`)

Research loop for SPY options edges: GCS day aggregates → BigQuery surfaces → event-gated backtests → kill/promote ledger.

## Data sources

| Source | Env | Role |
|---|---|---|
| Massive | `MASSIVE_API_KEY` | SPY bars, nightly options snapshot, GCS flat files |
| **Financial Modeling Prep** | `FMP_API_KEY` | Economic calendar (FOMC/NFP/CPI/macros) → `market_events`; SPY EOD fallback |
| GCS | ADC / `GCP_PROJECT` | `gs://damarketdata/option_day_aggs` (SPY filter only) |
| BigQuery | `GCP_PROJECT=goldman-hax` | Dataset `options_lab` |

FMP is preferred for force-flow macros. OPEX / EOM / EOQ / holidays are computed locally; `data/fomc_dates.json` is a fallback when FMP is unset.

## Setup

```bash
cd services/spy_lab
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
# from repo root .env:
# FMP_API_KEY=...
# MASSIVE_API_KEY=...
# GCP_PROJECT=goldman-hax
```

```bash
spy-lab init-bq
spy-lab backfill-events --start 2018-01-01 --end 2026-07-28
spy-lab backfill-underlying --start 2018-01-01 --end 2026-07-28
spy-lab backfill-surfaces --start 2018-01-01 --end 2026-07-28   # SPY filter; long
spy-lab nightly
spy-lab run-spec
spy-lab overnight
```

## Tests

```bash
pytest
```
