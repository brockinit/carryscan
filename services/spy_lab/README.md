# SPY Edge Factory (`spy_lab`)

Research loop for SPY options edges: GCS day aggregates → BigQuery surfaces → event-gated backtests → kill/promote ledger.

## Data sources

| Source | Env | Role |
|---|---|---|
| Massive | `MASSIVE_API_KEY` | SPY bars, nightly options snapshot, GCS flat files |
| **Financial Modeling Prep** | `FMP_API_KEY` | Economic calendar (FOMC/NFP/CPI/macros) → `market_events`; SPY EOD fallback |
| GCS | ADC / `GCP_PROJECT` | `gs://damarketdata/option_day_aggs` — BQ loads in-region, SPY filter in SQL |
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
spy-lab backfill-surfaces --start 2018-01-01 --end 2026-07-28   # BQ loads GCS; no laptop egress
spy-lab nightly
spy-lab run-spec
spy-lab overnight
```

`backfill-surfaces` asks BigQuery to load each `gs://…/YYYY-MM-DD.csv.gz` in-region, keeps `O:SPY*`, then this machine only pulls that small slice to build IV/surfaces. Use `--local-download` only if you intentionally want the old (billable) path.

If the load job cannot read the bucket, grant the BigQuery service account object viewer:

```bash
PROJECT_NUM=$(gcloud projects describe goldman-hax --format='value(projectNumber)')
gsutil iam ch \
  "serviceAccount:service-${PROJECT_NUM}@gcp-sa-bigquery.iam.gserviceaccount.com:objectViewer" \
  gs://damarketdata
```

## Tests

```bash
pytest
```
