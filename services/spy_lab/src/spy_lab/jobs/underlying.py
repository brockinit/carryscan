"""SPY underlying_daily — Massive bars preferred, FMP EOD fallback."""
from __future__ import annotations

from datetime import date, timedelta

from spy_lab.bq import Bq
from spy_lab.config import get_settings
from spy_lab.events import (
    build_all_events,
    event_flags_for_date,
    iter_trading_days,
    load_holidays,
)
from spy_lab.features import enrich_bars
from spy_lab.fmp import FmpClient
from spy_lab.massive_rest import MassiveClient
from spy_lab.moc import enabled as moc_enabled
from spy_lab.moc import fetch_moc_imbalances, moc_ratio_for_spy


def _fetch_bars(start: date, end: date):
    settings = get_settings()
    ticker = settings.underlying
    massive = MassiveClient(settings)
    if massive.enabled:
        try:
            bars = massive.daily_bars(ticker, start, end)
            if bars:
                return bars, "massive"
        except Exception as e:
            print(f"Massive bars failed ({e}); trying FMP")
    fmp = FmpClient()
    if fmp.enabled:
        bars = fmp.historical_bars(ticker, start, end)
        if bars:
            return bars, "fmp"
    raise RuntimeError("No bars: set MASSIVE_API_KEY and/or FMP_API_KEY")


def run_backfill_underlying(
    start: date,
    end: date,
    *,
    bq: Bq | None = None,
) -> int:
    bq = bq or Bq()
    settings = get_settings()
    bars, source = _fetch_bars(start, end)
    rows = enrich_bars(settings.underlying, bars)
    events = build_all_events(start, end, use_fmp=bool(FmpClient().enabled))
    holidays = load_holidays()
    trading = iter_trading_days(start, end + timedelta(days=40), holidays)

    out = []
    for r in rows:
        if not (start <= r.as_of_date <= end):
            continue
        flags = event_flags_for_date(r.as_of_date, events, trading)
        for k, v in flags.items():
            setattr(r, k, v)
        if moc_enabled():
            moc_ev = fetch_moc_imbalances(r.as_of_date)
            if moc_ev:
                bq.merge_events(moc_ev)
                r.moc_imbalance_ratio = moc_ratio_for_spy(moc_ev)
        out.append(r.as_dict())

    n = bq.merge_underlying(out)
    bq.apply_event_flags(start, end)
    bq.checkpoint(
        "underlying", f"{start}_{end}", "done", f"n={n} source={source}"
    )
    return n
