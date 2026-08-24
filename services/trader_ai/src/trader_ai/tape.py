"""RTH tape worker: Massive REST → GEX + minutes + notables + character."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from trader_ai.character import MinuteBar, classify_level_touch, score_character
from trader_ai.config import Settings, get_settings
from trader_ai.gex import ChainContract, compute_gex, gex_as_dict
from trader_ai import store

ET = ZoneInfo("America/New_York")


def is_rth(now: datetime | None = None) -> bool:
    ts = (now or datetime.now(timezone.utc)).astimezone(ET)
    if ts.weekday() >= 5:
        return False
    minutes = ts.hour * 60 + ts.minute
    return 9 * 60 + 25 <= minutes <= 16 * 60 + 10


def _get(settings: Settings, path: str, params: dict | None = None) -> Any:
    p = dict(params or {})
    p["apiKey"] = settings.massive_api_key
    r = httpx.get(f"{settings.massive_base_url.rstrip('/')}{path}", params=p, timeout=60.0)
    r.raise_for_status()
    return r.json()


def fetch_spot(ticker: str, settings: Settings) -> float | None:
    data = _get(settings, f"/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}")
    t = data.get("ticker") or {}
    day = t.get("day") or {}
    last = (t.get("lastTrade") or {}).get("p") or day.get("c")
    return float(last) if last else None


def fetch_minutes(ticker: str, settings: Settings, limit: int = 120) -> list[dict]:
    data = _get(
        settings,
        f"/v2/aggs/ticker/{ticker}/range/1/minute/2020-01-01/2100-01-01",
        {"adjusted": "true", "sort": "desc", "limit": limit},
    )
    out = []
    for row in reversed(data.get("results") or []):
        out.append(
            {
                "ts": datetime.fromtimestamp(row["t"] / 1000, tz=timezone.utc),
                "o": float(row["o"]),
                "h": float(row["h"]),
                "l": float(row["l"]),
                "c": float(row["c"]),
                "v": float(row.get("v") or 0),
            }
        )
    return out


def fetch_chain(underlying: str, settings: Settings) -> list[ChainContract]:
    from datetime import date as date_cls

    from spy_lab.occ import dte as occ_dte
    from spy_lab.occ import parse_occ

    contracts: list[ChainContract] = []
    params: dict[str, Any] = {"limit": 250}
    path = f"/v3/snapshot/options/{underlying}"
    while True:
        data = _get(settings, path, params)
        for item in data.get("results") or []:
            details = item.get("details") or {}
            ticker = details.get("ticker") or item.get("ticker")
            occ = parse_occ(ticker) if ticker else None
            if occ is None:
                continue
            greeks = item.get("greeks") or {}
            contracts.append(
                ChainContract(
                    strike=float(occ.strike),
                    cp=occ.cp,
                    oi=float(item.get("open_interest") or 0),
                    gamma=float(greeks["gamma"]) if greeks.get("gamma") is not None else None,
                    delta=float(greeks["delta"]) if greeks.get("delta") is not None else None,
                    iv=float(item["implied_volatility"])
                    if item.get("implied_volatility") is not None
                    else None,
                    volume=float((item.get("day") or {}).get("volume") or 0),
                    dte=occ_dte(date_cls.today(), occ.expiry),
                )
            )
        nxt = data.get("next_url")
        if not nxt or "cursor=" not in nxt:
            break
        params = {"limit": 250, "cursor": nxt.split("cursor=")[1].split("&")[0]}
    return contracts


def fetch_vix(settings: Settings) -> float | None:
    try:
        return fetch_spot("I:VIX", settings)
    except Exception:
        return None


def notable_from_print(premium: float, size: float, *, prem_cut: float = 50_000, size_cut: float = 200) -> bool:
    return premium >= prem_cut or size >= size_cut


def clock_label(now: datetime | None = None) -> str | None:
    ts = (now or datetime.now(timezone.utc)).astimezone(ET)
    hm = (ts.hour, ts.minute)
    if hm == (10, 0):
        return "1000et"
    if hm == (14, 0):
        return "1400et"
    return None


def tick_ticker(ticker: str, settings: Settings | None = None) -> dict:
    s = settings or get_settings()
    out: dict[str, Any] = {"ticker": ticker}
    if not s.massive_enabled:
        return {**out, "skipped": "MASSIVE_API_KEY unset"}

    spot = fetch_spot("SPX" if ticker == "SPX" else ticker, s)
    bars = fetch_minutes("SPY" if ticker == "SPX" else ticker, s)
    if bars:
        store.insert_minutes(ticker if ticker != "SPX" else "SPY", bars, settings=s)
        prior = store.latest_character(ticker)
        state = score_character(
            [MinuteBar(o=b["o"], h=b["h"], l=b["l"], c=b["c"], v=b["v"]) for b in bars],
            prior_label=prior["label"] if prior else None,
        )
        store.insert_character(ticker, {
            **{
                "label": state.label,
                "trend_vs_balance": state.trend_vs_balance,
                "follow_vs_fade": state.follow_vs_fade,
                "vol_texture": state.vol_texture,
                "flipped": state.flipped,
                "prior_label": state.prior_label,
                "features": state.features,
                "apply_strategies": state.apply_strategies,
                "avoid_strategies": state.avoid_strategies,
            }
        }, settings=s)
        last = bars[-1]
        if spot and prior:
            for name, lvl in (("vwap", None),):
                _ = name, lvl
            # PDH/PDL from first bar of session is coarse; use day high/low of window
            pdh = max(b["h"] for b in bars[: min(30, len(bars))])
            pdl = min(b["l"] for b in bars[: min(30, len(bars))])
            for name, level in (("session_high", pdh), ("session_low", pdl)):
                outcome = classify_level_touch(
                    level=level, low=last["l"], high=last["h"], close=last["c"]
                )
                if outcome:
                    store.upsert_level_reaction(ticker, name, state.label, outcome, settings=s)
        out["character"] = state.label
        out["bars"] = len(bars)

    if ticker in ("SPY", "SPX") and spot:
        try:
            chain = fetch_chain("SPY", s)
            snap = compute_gex(spot, chain)
            store.insert_gex(ticker, gex_as_dict(snap), settings=s)
            out["gex"] = {"net": snap.net_gex, "call_wall": snap.call_wall, "put_wall": snap.put_wall}
        except Exception as e:
            out["gex_error"] = str(e)

    vix = fetch_vix(s)
    store.insert_session_feature(
        ticker,
        {"spot": spot},
        vix=vix,
        clock=clock_label(),
    )
    out["spot"] = spot
    out["vix"] = vix
    return out


def run_once(settings: Settings | None = None, *, force: bool = False) -> list[dict]:
    s = settings or get_settings()
    if not force and not is_rth():
        return [{"skipped": "outside RTH"}]
    return [tick_ticker(t, s) for t in s.watchlist]


def run_loop(poll_seconds: int = 90) -> None:
    import time

    while True:
        try:
            print(run_once())
        except Exception as e:
            print({"tape_error": str(e)})
        time.sleep(poll_seconds)
