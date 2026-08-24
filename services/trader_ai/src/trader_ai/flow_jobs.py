"""Daily / weekly inferred flow rollups."""
from __future__ import annotations

from datetime import date, timedelta

from trader_ai import store
from trader_ai.config import Settings, get_settings
from trader_ai.flow import flow_as_dict, rollup_daily


def _week_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


def rollup_ticker_day(
    ticker: str,
    as_of: date,
    bar: dict,
    *,
    vol20: float | None,
    prior_ad: float,
    call_oi: float | None,
    prior_call_oi: float | None,
    put_oi: float | None,
    prior_put_oi: float | None,
    unusual_premium: float | None,
    settings: Settings | None = None,
) -> dict:
    row = rollup_daily(
        ticker,
        as_of.isoformat(),
        o=bar.get("o"),
        h=bar.get("h"),
        l=bar.get("l"),
        c=bar.get("c"),
        volume=bar.get("v"),
        vol20=vol20,
        prior_ad=prior_ad,
        call_oi=call_oi,
        prior_call_oi=prior_call_oi,
        put_oi=put_oi,
        prior_put_oi=prior_put_oi,
        unusual_premium=unusual_premium,
    )
    payload = flow_as_dict(row)
    store.upsert_flow_daily(payload, settings=settings)
    return payload


def rollup_week(ticker: str, week_of: date, days: list[dict], *, settings: Settings | None = None) -> dict:
    vol = sum(d.get("stock_volume") or 0 for d in days)
    call = sum(d.get("call_oi_change") or 0 for d in days)
    put = sum(d.get("put_oi_change") or 0 for d in days)
    prem = sum(d.get("unusual_premium") or 0 for d in days)
    ad = days[-1].get("ad_line") if days else None
    note = "inferred weekly rollup"
    row = {
        "ticker": ticker,
        "week_of": week_of.isoformat(),
        "stock_volume": vol,
        "ad_line": ad,
        "call_oi_change": call,
        "put_oi_change": put,
        "unusual_premium": prem,
        "note": note,
        "extras": {"n_days": len(days)},
    }
    store.upsert_flow_weekly(row, settings=settings)
    return row


def run_daily(settings: Settings | None = None) -> list[dict]:
    """Best-effort: pull last Massive daily bar + last GEX OI proxy."""
    from trader_ai.tape import fetch_minutes

    s = settings or get_settings()
    out = []
    today = date.today()
    for ticker in s.watchlist:
        if ticker == "SPX":
            continue
        try:
            bars = fetch_minutes(ticker, s, limit=400)
        except Exception as e:
            out.append({"ticker": ticker, "error": str(e)})
            continue
        if not bars:
            continue
        last = bars[-1]
        # session volume proxy
        sess = [b for b in bars if b["ts"].date() == last["ts"].date()]
        vol = sum(b.get("v") or 0 for b in sess)
        o = sess[0]["o"] if sess else last["o"]
        h = max(b["h"] for b in sess) if sess else last["h"]
        l = min(b["l"] for b in sess) if sess else last["l"]
        prior = store.latest_flow(ticker) or {}
        gex = store.latest_gex(ticker) or {}
        by = gex.get("by_strike") or []
        if isinstance(by, str):
            by = []
        call_proxy = sum(abs(x.get("gex") or 0) for x in by if (x.get("gex") or 0) > 0)
        put_proxy = sum(abs(x.get("gex") or 0) for x in by if (x.get("gex") or 0) < 0)
        row = rollup_ticker_day(
            ticker,
            today,
            {"o": o, "h": h, "l": l, "c": last["c"], "v": vol},
            vol20=None,
            prior_ad=float(prior.get("ad_line") or 0),
            call_oi=call_proxy or None,
            prior_call_oi=None,
            put_oi=put_proxy or None,
            prior_put_oi=None,
            unusual_premium=None,
            settings=s,
        )
        days = store.list_flow(ticker, 5, settings=s)
        week = _week_of(today)
        rollup_week(ticker, week, days, settings=s)
        out.append(row)
    return out
