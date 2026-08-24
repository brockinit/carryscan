"""Per-asset character: measured state + apply/avoid map. No mood language."""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Sequence


@dataclass(frozen=True)
class MinuteBar:
    o: float
    h: float
    l: float
    c: float
    v: float = 0.0


@dataclass
class CharacterState:
    label: str
    trend_vs_balance: float
    follow_vs_fade: float
    vol_texture: float
    efficiency: float
    range_vs_atr: float
    flipped: bool
    prior_label: str | None
    apply_strategies: list[str]
    avoid_strategies: list[str]
    features: dict


STRATEGY_MAP: dict[str, dict[str, list[str]]] = {
    "balance": {
        "apply": ["fade_edges", "mean_revert_vwap", "defined_risk_pin"],
        "avoid": ["breakout_chase", "fade_first_break"],
    },
    "trend": {
        "apply": ["pullbacks_in_direction", "break_hold"],
        "avoid": ["fade_first_break", "fade_edges"],
    },
    "compression": {
        "apply": ["wait_for_expansion", "defined_risk_short_vol"],
        "avoid": ["long_gamma_chase", "size_up"],
    },
    "expansion": {
        "apply": ["follow_through", "reduce_fade"],
        "avoid": ["iron_into_expansion"],
    },
}


def _efficiency(bars: Sequence[MinuteBar]) -> float:
    if len(bars) < 2:
        return 0.0
    path = sum(abs(bars[i].c - bars[i - 1].c) for i in range(1, len(bars)))
    if path <= 0:
        return 0.0
    return abs(bars[-1].c - bars[0].c) / path


def _atr(bars: Sequence[MinuteBar]) -> float:
    if not bars:
        return 0.0
    return sum(b.h - b.l for b in bars) / len(bars)


def _range_vs_atr(bars: Sequence[MinuteBar], lookback: int = 20) -> float:
    if len(bars) < 3:
        return 1.0
    last = bars[-1].h - bars[-1].l
    hist = _atr(bars[-lookback:])
    if hist <= 0:
        return 1.0
    return last / hist


def _follow_vs_fade(bars: Sequence[MinuteBar]) -> float:
    """Share of bars whose close continues the prior bar's direction."""
    if len(bars) < 3:
        return 0.5
    follows = 0
    n = 0
    for i in range(2, len(bars)):
        prev = bars[i - 1].c - bars[i - 2].c
        cur = bars[i].c - bars[i - 1].c
        if prev == 0:
            continue
        n += 1
        if prev * cur > 0:
            follows += 1
    return follows / n if n else 0.5


def _vol_texture(bars: Sequence[MinuteBar]) -> float:
    """>1 expanding, <1 compressing vs first half of the window."""
    if len(bars) < 8:
        return 1.0
    mid = len(bars) // 2
    a = _atr(bars[:mid])
    b = _atr(bars[mid:])
    if a <= 0:
        return 1.0
    return b / a


def label_from_scores(efficiency: float, follow: float, vol: float) -> str:
    if vol < 0.7 and efficiency < 0.25:
        return "compression"
    if vol > 1.4 and efficiency > 0.35:
        return "expansion"
    if efficiency >= 0.35 and follow >= 0.55:
        return "trend"
    return "balance"


def score_character(
    bars: Sequence[MinuteBar],
    *,
    prior_label: str | None = None,
    flip_persist: int = 2,
    pending_label: str | None = None,
    pending_count: int = 0,
) -> CharacterState:
    eff = _efficiency(bars)
    follow = _follow_vs_fade(bars)
    vol = _vol_texture(bars)
    rva = _range_vs_atr(bars)
    raw = label_from_scores(eff, follow, vol)
    flipped = False
    label = prior_label or raw
    if prior_label and raw != prior_label:
        if pending_label == raw and pending_count + 1 >= flip_persist:
            label = raw
            flipped = True
        elif pending_label == raw:
            label = prior_label
        else:
            label = prior_label
    else:
        label = raw
        flipped = prior_label is not None and raw != prior_label and flip_persist <= 1

    amap = STRATEGY_MAP.get(label, STRATEGY_MAP["balance"])
    return CharacterState(
        label=label,
        trend_vs_balance=eff,
        follow_vs_fade=follow,
        vol_texture=vol,
        efficiency=eff,
        range_vs_atr=rva,
        flipped=flipped,
        prior_label=prior_label,
        apply_strategies=list(amap["apply"]),
        avoid_strategies=list(amap["avoid"]),
        features={
            "efficiency": eff,
            "follow_vs_fade": follow,
            "vol_texture": vol,
            "range_vs_atr": rva,
            "raw_label": raw,
        },
    )


def character_as_dict(state: CharacterState) -> dict:
    return asdict(state)


def reaction_rates(hold_n: int, reject_n: int, through_n: int) -> dict:
    n = hold_n + reject_n + through_n
    if n <= 0:
        return {"n": 0, "hold": None, "reject": None, "through": None}
    return {
        "n": n,
        "hold": hold_n / n,
        "reject": reject_n / n,
        "through": through_n / n,
    }


def classify_level_touch(
    *,
    level: float,
    low: float,
    high: float,
    close: float,
    band_pct: float = 0.0015,
) -> str | None:
    """hold | reject | through | None if price never reached the band."""
    if level <= 0:
        return None
    band = level * band_pct
    touched = low <= level + band and high >= level - band
    if not touched:
        return None
    if close > level + band:
        return "through" if high > level + band else "hold"
    if close < level - band:
        return "through" if low < level - band else "reject"
    return "hold"
