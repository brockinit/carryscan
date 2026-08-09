"""Black–Scholes IV and greeks (European; research-grade for SPY ETF options)."""
from __future__ import annotations

import math
from dataclasses import dataclass


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _norm_pdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / math.sqrt(2.0 * math.pi)


@dataclass(frozen=True)
class BsResult:
    iv: float
    delta: float
    price: float


def bs_price(
    spot: float,
    strike: float,
    t_years: float,
    r: float,
    sigma: float,
    cp: str,
) -> float:
    if t_years <= 0 or sigma <= 0 or spot <= 0 or strike <= 0:
        intrinsic = max(spot - strike, 0.0) if cp == "C" else max(strike - spot, 0.0)
        return intrinsic
    sqrt_t = math.sqrt(t_years)
    d1 = (math.log(spot / strike) + (r + 0.5 * sigma * sigma) * t_years) / (
        sigma * sqrt_t
    )
    d2 = d1 - sigma * sqrt_t
    if cp == "C":
        return spot * _norm_cdf(d1) - strike * math.exp(-r * t_years) * _norm_cdf(d2)
    return strike * math.exp(-r * t_years) * _norm_cdf(-d2) - spot * _norm_cdf(-d1)


def bs_delta(
    spot: float,
    strike: float,
    t_years: float,
    r: float,
    sigma: float,
    cp: str,
) -> float:
    if t_years <= 0 or sigma <= 0 or spot <= 0 or strike <= 0:
        if cp == "C":
            return 1.0 if spot > strike else 0.0
        return -1.0 if spot < strike else 0.0
    sqrt_t = math.sqrt(t_years)
    d1 = (math.log(spot / strike) + (r + 0.5 * sigma * sigma) * t_years) / (
        sigma * sqrt_t
    )
    if cp == "C":
        return _norm_cdf(d1)
    return _norm_cdf(d1) - 1.0


def implied_vol(
    mid: float,
    spot: float,
    strike: float,
    t_years: float,
    r: float,
    cp: str,
    *,
    lo: float = 1e-4,
    hi: float = 5.0,
    tol: float = 1e-5,
    max_iter: int = 80,
) -> float | None:
    """Brent-style bisection for IV. None if unsolvable."""
    if mid is None or mid <= 0 or spot <= 0 or strike <= 0 or t_years <= 0:
        return None
    intrinsic = max(spot - strike, 0.0) if cp == "C" else max(strike - spot, 0.0)
    # Discounted intrinsic floor
    disc_intr = (
        max(spot - strike * math.exp(-r * t_years), 0.0)
        if cp == "C"
        else max(strike * math.exp(-r * t_years) - spot, 0.0)
    )
    if mid < disc_intr * 0.99:
        return None
    if mid < 1e-6:
        return None

    def f(sig: float) -> float:
        return bs_price(spot, strike, t_years, r, sig, cp) - mid

    flo, fhi = f(lo), f(hi)
    if flo > 0:
        return lo
    if fhi < 0:
        # Even huge vol underprices — skip
        return None
    a, b = lo, hi
    fa = flo
    for _ in range(max_iter):
        mid_sig = 0.5 * (a + b)
        fm = f(mid_sig)
        if abs(fm) < tol or (b - a) < tol:
            return mid_sig
        if fa * fm <= 0:
            b = mid_sig
        else:
            a, fa = mid_sig, fm
    return 0.5 * (a + b)


def price_and_greeks(
    mid: float,
    spot: float,
    strike: float,
    t_years: float,
    r: float,
    cp: str,
) -> BsResult | None:
    iv = implied_vol(mid, spot, strike, t_years, r, cp)
    if iv is None:
        return None
    return BsResult(
        iv=iv,
        delta=bs_delta(spot, strike, t_years, r, iv, cp),
        price=mid,
    )
