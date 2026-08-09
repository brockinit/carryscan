"""Phase 2: NYSE MOC / order imbalances (Massive auction add-on).

Schema is reserved on underlying_daily.moc_imbalance_ratio and
market_events.event_type='moc_imbalance'. Enable when MASSIVE_AUCTION=1
and the add-on is purchased.
"""
from __future__ import annotations

import os
from datetime import date
from typing import Any

import httpx

from spy_lab.config import get_settings


def enabled() -> bool:
    return os.getenv("MASSIVE_AUCTION", "").strip() in ("1", "true", "TRUE", "yes")


def fetch_moc_imbalances(as_of: date) -> list[dict[str, Any]]:
    """Stub: pull close imbalances when auction API is available.

    Returns market_events-shaped dicts. Until the Massive NYSE Order Imbalances
    add-on is wired, this returns [].
    """
    if not enabled():
        return []
    settings = get_settings()
    if not settings.massive_api_key:
        return []
    # Placeholder endpoint — update when Massive documents the auction REST path.
    # Expected: list of {ticker, imb_buy, imb_sell, paired, ...} for as_of.
    url = f"{settings.massive_base_url.rstrip('/')}/v1/indicators/order-imbalances"
    try:
        r = httpx.get(
            url,
            params={"date": as_of.isoformat(), "apiKey": settings.massive_api_key},
            timeout=30.0,
        )
        if r.status_code in (404, 403, 401):
            return []
        r.raise_for_status()
        data = r.json()
    except Exception:
        return []
    rows = data if isinstance(data, list) else data.get("results") or []
    out: list[dict[str, Any]] = []
    for row in rows:
        buy = float(row.get("imb_buy") or row.get("buy_volume") or 0)
        sell = float(row.get("imb_sell") or row.get("sell_volume") or 0)
        total = buy + sell
        ratio = ((buy - sell) / total) if total else None
        out.append(
            {
                "as_of_date": as_of.isoformat(),
                "event_type": "moc_imbalance",
                "severity": "notable",
                "source": "massive_auction",
                "meta": {
                    "ticker": row.get("ticker") or "SPY",
                    "imb_buy": buy,
                    "imb_sell": sell,
                    "ratio": ratio,
                    "raw": row,
                },
            }
        )
    return out


def moc_ratio_for_spy(events: list[dict]) -> float | None:
    for e in events:
        if e.get("event_type") != "moc_imbalance":
            continue
        meta = e.get("meta") or {}
        if str(meta.get("ticker", "SPY")).upper() in ("SPY", "SPY.US"):
            return meta.get("ratio")
    return None
