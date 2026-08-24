"""Inferred accumulation / distribution — numbers, never 'institutions'."""
from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass
class FlowDaily:
    ticker: str
    as_of: str
    stock_volume: float | None
    rel_vol_20: float | None
    ad_line: float | None
    call_oi_change: float | None
    put_oi_change: float | None
    unusual_premium: float | None
    put_call: float | None
    note: str


def close_location_value(o: float, h: float, l: float, c: float) -> float:
    """CLV in [-1, 1]. Close at high → +1."""
    rng = h - l
    if rng <= 0:
        return 0.0
    return ((c - l) - (h - c)) / rng


def ad_increment(o: float, h: float, l: float, c: float, volume: float) -> float:
    return close_location_value(o, h, l, c) * volume


def infer_note(
    *,
    rel_vol_20: float | None,
    ad_delta: float | None,
    call_oi_change: float | None,
    put_oi_change: float | None,
    unusual_premium: float | None,
) -> str:
    bits: list[str] = ["inferred"]
    if rel_vol_20 is not None and rel_vol_20 >= 1.5:
        bits.append(f"stock volume {rel_vol_20:.2f}× 20d")
    if ad_delta is not None and ad_delta > 0:
        bits.append("A/D positive")
    elif ad_delta is not None and ad_delta < 0:
        bits.append("A/D negative")
    if call_oi_change is not None and call_oi_change > 0:
        bits.append(f"call OI {call_oi_change:+.0f}")
    if put_oi_change is not None and put_oi_change > 0:
        bits.append(f"put OI {put_oi_change:+.0f}")
    if unusual_premium is not None and unusual_premium > 0:
        bits.append(f"unusual premium {unusual_premium:.0f}")
    if len(bits) == 1:
        bits.append("no standout build")
    return ": ".join([bits[0], ", ".join(bits[1:])])


def rollup_daily(
    ticker: str,
    as_of: str,
    *,
    o: float | None,
    h: float | None,
    l: float | None,
    c: float | None,
    volume: float | None,
    vol20: float | None,
    prior_ad: float,
    call_oi: float | None,
    prior_call_oi: float | None,
    put_oi: float | None,
    prior_put_oi: float | None,
    unusual_premium: float | None,
) -> FlowDaily:
    rel = None
    if volume is not None and vol20 and vol20 > 0:
        rel = volume / vol20
    ad = prior_ad
    if None not in (o, h, l, c, volume):
        ad = prior_ad + ad_increment(o, h, l, c, volume)  # type: ignore[arg-type]
    call_chg = (
        (call_oi - prior_call_oi)
        if call_oi is not None and prior_call_oi is not None
        else None
    )
    put_chg = (
        (put_oi - prior_put_oi)
        if put_oi is not None and prior_put_oi is not None
        else None
    )
    pc = None
    if call_oi and put_oi is not None and call_oi > 0:
        pc = put_oi / call_oi
    note = infer_note(
        rel_vol_20=rel,
        ad_delta=ad - prior_ad,
        call_oi_change=call_chg,
        put_oi_change=put_chg,
        unusual_premium=unusual_premium,
    )
    return FlowDaily(
        ticker=ticker,
        as_of=as_of,
        stock_volume=volume,
        rel_vol_20=rel,
        ad_line=ad,
        call_oi_change=call_chg,
        put_oi_change=put_chg,
        unusual_premium=unusual_premium,
        put_call=pc,
        note=note,
    )


def flow_as_dict(row: FlowDaily) -> dict:
    return asdict(row)
