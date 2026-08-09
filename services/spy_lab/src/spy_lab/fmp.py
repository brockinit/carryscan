"""Financial Modeling Prep client — economic calendar + equity bars."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import httpx

from spy_lab.features import Bar


class FmpClient:
    """Uses stable economic-calendar API (legacy /api/v3 calendar retired)."""

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
    ):
        from spy_lab.config import get_settings

        settings = get_settings()
        self.api_key = api_key if api_key is not None else settings.fmp_api_key
        self.base_url = (base_url or settings.fmp_base_url).rstrip("/")

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        if not self.enabled:
            raise RuntimeError("FMP_API_KEY unset")
        p = dict(params or {})
        p["apikey"] = self.api_key
        url = f"{self.base_url}{path}"
        r = httpx.get(url, params=p, timeout=60.0)
        r.raise_for_status()
        return r.json()

    def economic_calendar(self, start: date, end: date) -> list[dict]:
        """Fetch US-relevant economic events. Chunks into <=90d windows."""
        out: list[dict] = []
        cur = start
        while cur <= end:
            chunk_end = min(cur + timedelta(days=89), end)
            # Prefer stable endpoint; fall back to v3 if needed
            try:
                data = self._get(
                    "/stable/economic-calendar",
                    {"from": cur.isoformat(), "to": chunk_end.isoformat()},
                )
            except httpx.HTTPStatusError:
                data = self._get(
                    "/api/v3/economic_calendar",
                    {"from": cur.isoformat(), "to": chunk_end.isoformat()},
                )
            if isinstance(data, list):
                out.extend(data)
            cur = chunk_end + timedelta(days=1)
        return out

    def historical_bars(self, symbol: str, start: date, end: date) -> list[Bar]:
        """EOD bars via FMP historical-price-eod (stable) or v3 historical-price-full."""
        try:
            data = self._get(
                f"/stable/historical-price-eod/full",
                {
                    "symbol": symbol,
                    "from": start.isoformat(),
                    "to": end.isoformat(),
                },
            )
            rows = data if isinstance(data, list) else data.get("historical", [])
        except Exception:
            data = self._get(
                f"/api/v3/historical-price-full/{symbol}",
                {"from": start.isoformat(), "to": end.isoformat()},
            )
            rows = data.get("historical", []) if isinstance(data, dict) else []
        bars: list[Bar] = []
        for row in rows:
            d = row.get("date") or row.get("Date")
            if not d:
                continue
            as_of = date.fromisoformat(str(d)[:10])
            bars.append(
                Bar(
                    as_of_date=as_of,
                    o=float(row["open"]),
                    h=float(row["high"]),
                    l=float(row["low"]),
                    c=float(row["close"]),
                    v=float(row.get("volume") or 0),
                )
            )
        bars.sort(key=lambda b: b.as_of_date)
        return bars


# Map FMP event names → our event_type / flags
_FOMC_KEYS = ("fomc", "federal funds", "fed interest rate", "fed rate")
_NFP_KEYS = ("nonfarm", "non-farm", "payrolls")
_CPI_KEYS = ("cpi", "consumer price")


def classify_fmp_event(event_name: str) -> str | None:
    n = (event_name or "").lower()
    if any(k in n for k in _FOMC_KEYS):
        return "fomc"
    if any(k in n for k in _NFP_KEYS):
        return "nfp"
    if any(k in n for k in _CPI_KEYS) and "core" not in n[:8]:
        # keep both cpi and core_cpi distinguishable
        if "core" in n:
            return "core_cpi"
        return "cpi"
    if "pce" in n and "price" in n:
        return "pce"
    if "gdp" in n:
        return "gdp"
    impact_high = "high"
    # Generic high-impact US macro bucket handled by caller via impact field
    return None


def fmp_events_to_market_events(
    rows: list[dict],
    *,
    country: str = "US",
) -> list[dict]:
    """Convert FMP calendar rows to market_events dicts."""
    out: list[dict] = []
    for row in rows:
        ctry = (row.get("country") or row.get("currency") or "").upper()
        if country and ctry and country not in ctry and ctry != "USD":
            # FMP sometimes uses country=US or currency=USD
            if ctry not in ("US", "USA", "USD"):
                continue
        name = row.get("event") or row.get("name") or ""
        raw_date = row.get("date") or row.get("dateEvent")
        if not raw_date:
            continue
        # date may be "2024-01-31 14:00:00"
        as_of = date.fromisoformat(str(raw_date)[:10])
        etype = classify_fmp_event(name)
        impact = str(row.get("impact") or row.get("importance") or "").lower()
        if etype is None:
            if impact == "high" and ctry in ("US", "USA", "USD", ""):
                etype = "high_impact_macro"
            else:
                continue
        severity = (
            "high"
            if impact == "high" or etype in ("fomc", "nfp", "cpi")
            else "notable"
            if impact == "medium"
            else "info"
        )
        out.append(
            {
                "as_of_date": as_of.isoformat(),
                "event_type": etype,
                "severity": severity,
                "source": "fmp",
                "meta": {
                    "name": name,
                    "impact": impact,
                    "actual": row.get("actual"),
                    "estimate": row.get("estimate") or row.get("consensus"),
                    "previous": row.get("previous"),
                },
            }
        )
    return out
