"""Dealer gamma / wall features from a chain snapshot. Numbers only — no narrative."""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Iterable


@dataclass(frozen=True)
class ChainContract:
    strike: float
    cp: str  # C | P
    oi: float
    gamma: float | None = None
    delta: float | None = None
    iv: float | None = None
    volume: float = 0.0
    dte: int | None = None


@dataclass
class GexSnapshot:
    spot: float
    net_gex: float
    call_wall: float | None
    put_wall: float | None
    max_gex_strike: float | None
    gamma_sign: str
    by_strike: list[dict]


def _bs_gamma(spot: float, strike: float, t_years: float, sigma: float) -> float:
    if spot <= 0 or strike <= 0 or t_years <= 0 or sigma <= 0:
        return 0.0
    sqrt_t = math.sqrt(t_years)
    d1 = (math.log(spot / strike) + 0.5 * sigma * sigma * t_years) / (sigma * sqrt_t)
    pdf = math.exp(-0.5 * d1 * d1) / math.sqrt(2.0 * math.pi)
    return pdf / (spot * sigma * sqrt_t)


def contract_gamma(c: ChainContract, spot: float) -> float:
    if c.gamma is not None:
        return float(c.gamma)
    if c.iv is None or c.dte is None:
        return 0.0
    return _bs_gamma(spot, c.strike, max(c.dte, 1) / 365.0, float(c.iv))


def compute_gex(
    spot: float,
    contracts: Iterable[ChainContract],
    *,
    multiplier: float = 100.0,
) -> GexSnapshot:
    """Call GEX positive, put GEX negative (dealer-long-call / short-put convention)."""
    by: dict[float, float] = {}
    for c in contracts:
        g = contract_gamma(c, spot)
        signed = g * c.oi * multiplier * spot
        if c.cp == "P":
            signed = -signed
        by[c.strike] = by.get(c.strike, 0.0) + signed

    net = sum(by.values())
    max_strike = max(by, key=lambda k: abs(by[k])) if by else None
    calls = {k: v for k, v in by.items() if v > 0}
    puts = {k: v for k, v in by.items() if v < 0}
    call_wall = max(calls, key=lambda k: calls[k]) if calls else None
    put_wall = min(puts, key=lambda k: puts[k]) if puts else None
    rows = [
        {"strike": k, "gex": v}
        for k, v in sorted(by.items(), key=lambda kv: kv[0])
    ]
    return GexSnapshot(
        spot=spot,
        net_gex=net,
        call_wall=call_wall,
        put_wall=put_wall,
        max_gex_strike=max_strike,
        gamma_sign="positive" if net > 0 else ("negative" if net < 0 else "flat"),
        by_strike=rows,
    )


def gex_as_dict(snap: GexSnapshot) -> dict:
    return asdict(snap)
