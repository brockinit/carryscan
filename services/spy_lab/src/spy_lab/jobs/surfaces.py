"""option_day_aggs → spy_option_day + option_surface_daily (SPY only).

Default path: BigQuery loads each GCS day file in-region, filters O:SPY*,
then this process pulls only that small slice to build IV/surfaces.
"""
from __future__ import annotations

from datetime import date, timedelta

from google.api_core.exceptions import GoogleAPICallError, NotFound
from google.cloud import bigquery

from spy_lab.bq import Bq
from spy_lab.config import get_settings
from spy_lab.gcs_day_aggs import list_day_paths, load_spy_day
from spy_lab.occ import parse_occ
from spy_lab.surface import build_surface, contracts_from_day_aggs, enrich_iv


def _spot_from_bq(bq: Bq, d: date) -> float | None:
    table = bq.table_id("underlying_daily")
    job = bq.client.query(
        f"SELECT c FROM `{table}` WHERE as_of_date=@d AND ticker=@t LIMIT 1",
        job_config=bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("d", "DATE", d.isoformat()),
                bigquery.ScalarQueryParameter("t", "STRING", get_settings().underlying),
            ]
        ),
    )
    for row in job.result():
        return float(row["c"])
    return None


def _bq_option_rows(as_of: date, raw_rows: list[dict], contracts: list) -> list[dict]:
    by_ticker = {c.ticker: c for c in contracts}
    out = []
    for row in raw_rows:
        occ = parse_occ(row["ticker"])
        if occ is None:
            continue
        c = by_ticker.get(row["ticker"].strip().upper())
        out.append(
            {
                "as_of_date": as_of.isoformat(),
                "ticker": row["ticker"],
                "root": occ.root,
                "expiry": occ.expiry.isoformat(),
                "cp": occ.cp,
                "strike": occ.strike,
                "o": row.get("open"),
                "h": row.get("high"),
                "l": row.get("low"),
                "c": row.get("close"),
                "v": row.get("volume"),
                "transactions": row.get("transactions"),
                "iv": c.iv if c else None,
                "delta": c.delta if c else None,
            }
        )
    return out


def _iter_weekdays(start: date, end: date):
    d = start
    while d <= end:
        if d.weekday() < 5:
            yield d
        d += timedelta(days=1)


def _build_and_merge_surfaces(
    bq: Bq,
    as_of: date,
    raw: list[dict],
    *,
    source: str,
) -> int:
    settings = get_settings()
    spot = _spot_from_bq(bq, as_of)
    if spot is None:
        bq.checkpoint("surfaces", as_of.isoformat(), "skip", "no underlying spot")
        return 0
    contracts = contracts_from_day_aggs(raw, as_of)
    surfaces = build_surface(
        as_of,
        settings.underlying,
        spot,
        contracts,
        source=source,
        r=settings.risk_free_rate,
    )
    bq.merge_surfaces([s.as_dict() for s in surfaces])
    return len(raw)


def run_backfill_surfaces(
    start: date,
    end: date,
    *,
    skip_done: bool = True,
    local_download: bool = False,
    bq: Bq | None = None,
) -> int:
    if local_download:
        return _run_local_download(start, end, skip_done=skip_done, bq=bq)
    return _run_bq_gcs_load(start, end, skip_done=skip_done, bq=bq)


def _run_bq_gcs_load(
    start: date,
    end: date,
    *,
    skip_done: bool,
    bq: Bq | None,
) -> int:
    bq = bq or Bq()
    done = 0
    for d in _iter_weekdays(start, end):
        key = d.isoformat()
        if skip_done and bq.get_checkpoint("surfaces", key) == "done":
            continue
        try:
            n = bq.ingest_spy_day_from_gcs(d)
        except NotFound:
            bq.checkpoint("surfaces", key, "empty", "gcs object missing")
            continue
        except GoogleAPICallError as e:
            msg = str(e)
            if "Not found" in msg or "404" in msg:
                bq.checkpoint("surfaces", key, "empty", "gcs object missing")
                continue
            bq.checkpoint("surfaces", key, "error", msg[:500])
            raise
        except Exception as e:
            bq.checkpoint("surfaces", key, "error", str(e)[:500])
            raise
        if n <= 0:
            bq.checkpoint("surfaces", key, "empty", "no SPY rows")
            continue
        raw = bq.fetch_spy_option_day(d)
        try:
            written = _build_and_merge_surfaces(
                bq, d, raw, source="gcs_day_aggs"
            )
        except Exception as e:
            bq.checkpoint("surfaces", key, "error", str(e)[:500])
            raise
        if written == 0 and bq.get_checkpoint("surfaces", key) == "skip":
            continue
        bq.checkpoint("surfaces", key, "done", f"n={n}")
        done += 1
        print(f"{key} spy_rows={n}")
    return done


def _run_local_download(
    start: date,
    end: date,
    *,
    skip_done: bool,
    bq: Bq | None,
) -> int:
    """Legacy: download full-market gzips to this machine. Incurs GCS egress."""
    bq = bq or Bq()
    settings = get_settings()
    paths = list_day_paths(start, end, settings)
    done = 0
    for d, _blob in paths:
        key = d.isoformat()
        if skip_done and bq.get_checkpoint("surfaces", key) == "done":
            continue
        try:
            as_of, raw = load_spy_day(d, settings)
            if not raw:
                bq.checkpoint("surfaces", key, "empty", "no SPY rows")
                continue
            contracts = contracts_from_day_aggs(raw, as_of)
            spot = _spot_from_bq(bq, as_of)
            if spot is None:
                bq.checkpoint("surfaces", key, "skip", "no underlying spot")
                continue
            surfaces = build_surface(
                as_of,
                settings.underlying,
                spot,
                contracts,
                source="gcs_day_aggs",
                r=settings.risk_free_rate,
            )
            enriched = enrich_iv(contracts, spot, as_of, settings.risk_free_rate)
            bq.load_spy_option_day(_bq_option_rows(as_of, raw, enriched), as_of)
            bq.merge_surfaces([s.as_dict() for s in surfaces])
            bq.checkpoint("surfaces", key, "done", f"n={len(raw)}")
            done += 1
        except Exception as e:
            bq.checkpoint("surfaces", key, "error", str(e)[:500])
            raise
    return done


def run_nightly_snapshot(as_of: date | None = None, *, bq: Bq | None = None) -> int:
    """Refresh underlying + FMP events; Massive REST chain → surfaces."""
    from spy_lab.jobs.events import run_backfill_events
    from spy_lab.jobs.underlying import run_backfill_underlying
    from spy_lab.massive_rest import MassiveClient

    bq = bq or Bq()
    as_of = as_of or date.today()
    start = as_of - timedelta(days=5)
    run_backfill_underlying(start, as_of, bq=bq)
    run_backfill_events(start, as_of + timedelta(days=30), bq=bq)

    settings = get_settings()
    spot = _spot_from_bq(bq, as_of)
    if spot is None:
        for i in range(1, 6):
            d = as_of - timedelta(days=i)
            spot = _spot_from_bq(bq, d)
            if spot is not None:
                as_of = d
                break
    if spot is None:
        raise RuntimeError("No SPY spot for nightly snapshot")

    client = MassiveClient(settings)
    if not client.enabled:
        print("MASSIVE_API_KEY unset — skipping options snapshot")
        return 0
    surfaces = client.snapshot_surface(as_of, spot)
    n = bq.merge_surfaces([s.as_dict() for s in surfaces])
    bq.checkpoint("nightly", as_of.isoformat(), "done", f"surfaces={n}")
    return n
