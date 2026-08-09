"""Massive REST — SPY bars + options chain snapshot."""
from __future__ import annotations

from datetime import date
from typing import Any

import httpx

from spy_lab.config import Settings, get_settings
from spy_lab.features import Bar
from spy_lab.occ import parse_occ
from spy_lab.surface import ContractRow, SurfaceRow, build_surface


class MassiveClient:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()

    @property
    def enabled(self) -> bool:
        return bool(self.settings.massive_api_key)

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        if not self.enabled:
            raise RuntimeError("MASSIVE_API_KEY unset")
        p = dict(params or {})
        p["apiKey"] = self.settings.massive_api_key
        url = f"{self.settings.massive_base_url.rstrip('/')}{path}"
        r = httpx.get(url, params=p, timeout=120.0)
        r.raise_for_status()
        return r.json()

    def daily_bars(self, ticker: str, start: date, end: date) -> list[Bar]:
        path = (
            f"/v2/aggs/ticker/{ticker}/range/1/day/"
            f"{start.isoformat()}/{end.isoformat()}"
        )
        data = self._get(path, {"adjusted": "true", "sort": "asc", "limit": 50000})
        bars: list[Bar] = []
        for row in data.get("results") or []:
            # t is ms
            from datetime import datetime, timezone

            as_of = datetime.fromtimestamp(row["t"] / 1000, tz=timezone.utc).date()
            bars.append(
                Bar(
                    as_of_date=as_of,
                    o=float(row["o"]),
                    h=float(row["h"]),
                    l=float(row["l"]),
                    c=float(row["c"]),
                    v=float(row.get("v") or 0),
                )
            )
        return bars

    def option_chain_contracts(self, underlying: str = "SPY") -> list[ContractRow]:
        """Paginate snapshot chain into ContractRows with vendor IV/delta when present."""
        out: list[ContractRow] = []
        url_path = f"/v3/snapshot/options/{underlying}"
        params: dict[str, Any] = {"limit": 250}
        while True:
            data = self._get(url_path, params)
            for item in data.get("results") or []:
                details = item.get("details") or {}
                ticker = details.get("ticker") or item.get("ticker")
                if not ticker:
                    continue
                occ = parse_occ(ticker)
                if occ is None:
                    continue
                quote = item.get("last_quote") or {}
                day = item.get("day") or {}
                mid = quote.get("midpoint")
                if mid is None:
                    bid, ask = quote.get("bid"), quote.get("ask")
                    if bid is not None and ask is not None:
                        mid = (float(bid) + float(ask)) / 2
                if mid is None:
                    mid = day.get("close") or day.get("previous_close")
                if mid is None or float(mid) <= 0:
                    continue
                greeks = item.get("greeks") or {}
                out.append(
                    ContractRow(
                        ticker=ticker,
                        occ=occ,
                        mid=float(mid),
                        volume=float(day.get("volume") or 0),
                        oi=int(item["open_interest"])
                        if item.get("open_interest") is not None
                        else None,
                        iv=float(item["implied_volatility"])
                        if item.get("implied_volatility") is not None
                        else None,
                        delta=float(greeks["delta"])
                        if greeks.get("delta") is not None
                        else None,
                    )
                )
            next_url = data.get("next_url")
            if not next_url:
                break
            # next_url is absolute; strip base
            if "cursor=" in next_url:
                cursor = next_url.split("cursor=")[1].split("&")[0]
                params = {"limit": 250, "cursor": cursor}
            else:
                break
        return out

    def snapshot_surface(self, as_of: date, spot: float) -> list[SurfaceRow]:
        contracts = self.option_chain_contracts(self.settings.underlying)
        return build_surface(
            as_of,
            self.settings.underlying,
            spot,
            contracts,
            source="snapshot",
            r=self.settings.risk_free_rate,
        )
