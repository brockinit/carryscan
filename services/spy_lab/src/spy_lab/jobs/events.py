"""Backfill market_events (computed + FMP economic calendar)."""
from __future__ import annotations

from datetime import date

from spy_lab.bq import Bq
from spy_lab.events import build_all_events
from spy_lab.fmp import FmpClient


def run_backfill_events(
    start: date,
    end: date,
    *,
    use_fmp: bool = True,
    bq: Bq | None = None,
) -> int:
    bq = bq or Bq()
    client = FmpClient()
    if use_fmp and not client.enabled:
        print("FMP_API_KEY unset — using computed OPEX/EOM/holiday/FOMC file only")
        use_fmp = False
    events = build_all_events(start, end, use_fmp=use_fmp)
    n = bq.merge_events(events)
    bq.apply_event_flags(start, end)
    bq.checkpoint("events", f"{start}_{end}", "done", f"n={n} fmp={use_fmp}")
    return n
