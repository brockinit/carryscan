"""Underlying daily feature engineering."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass
class Bar:
    as_of_date: date
    o: float
    h: float
    l: float
    c: float
    v: float


@dataclass
class UnderlyingRow:
    as_of_date: date
    ticker: str
    o: float
    h: float
    l: float
    c: float
    v: float
    gap_pct: float | None
    rel_vol_20: float | None
    prior_er: float | None
    rv5: float | None
    is_fomc: bool = False
    is_fomc_eve: bool = False
    is_opex: bool = False
    is_triple_witching: bool = False
    is_eom: bool = False
    is_eoq: bool = False
    is_vix_opex: bool = False
    is_half_day: bool = False
    days_to_fomc: int | None = None
    days_to_opex: int | None = None
    moc_imbalance_ratio: float | None = None
    is_nfp: bool = False
    is_cpi: bool = False
    is_high_impact_macro: bool = False

    def as_dict(self) -> dict:
        return {
            "as_of_date": self.as_of_date.isoformat(),
            "ticker": self.ticker,
            "o": self.o,
            "h": self.h,
            "l": self.l,
            "c": self.c,
            "v": self.v,
            "gap_pct": self.gap_pct,
            "rel_vol_20": self.rel_vol_20,
            "prior_er": self.prior_er,
            "rv5": self.rv5,
            "is_fomc": self.is_fomc,
            "is_fomc_eve": self.is_fomc_eve,
            "is_opex": self.is_opex,
            "is_triple_witching": self.is_triple_witching,
            "is_eom": self.is_eom,
            "is_eoq": self.is_eoq,
            "is_vix_opex": self.is_vix_opex,
            "is_half_day": self.is_half_day,
            "days_to_fomc": self.days_to_fomc,
            "days_to_opex": self.days_to_opex,
            "moc_imbalance_ratio": self.moc_imbalance_ratio,
            "is_nfp": self.is_nfp,
            "is_cpi": self.is_cpi,
            "is_high_impact_macro": self.is_high_impact_macro,
        }


def efficiency_ratio(o: float, h: float, l: float, c: float) -> float | None:
    rng = h - l
    if rng <= 0:
        return None
    return abs(c - o) / rng


def enrich_bars(ticker: str, bars: list[Bar]) -> list[UnderlyingRow]:
    bars = sorted(bars, key=lambda b: b.as_of_date)
    out: list[UnderlyingRow] = []
    for i, b in enumerate(bars):
        prev = bars[i - 1] if i > 0 else None
        gap = ((b.o - prev.c) / prev.c) if prev and prev.c else None
        vol20 = None
        if i >= 1:
            window = bars[max(0, i - 20) : i]
            avg = sum(x.v for x in window) / len(window) if window else None
            vol20 = (prev.v / avg) if prev and avg else None
        prior_er = (
            efficiency_ratio(prev.o, prev.h, prev.l, prev.c) if prev else None
        )
        rv5 = None
        if i >= 1:
            window = bars[max(0, i - 5) : i]
            rets = []
            for j in range(1, len(window)):
                if window[j - 1].c:
                    rets.append(abs(window[j].c / window[j - 1].c - 1))
            rv5 = sum(rets) / len(rets) if rets else None
        out.append(
            UnderlyingRow(
                as_of_date=b.as_of_date,
                ticker=ticker,
                o=b.o,
                h=b.h,
                l=b.l,
                c=b.c,
                v=b.v,
                gap_pct=gap,
                rel_vol_20=vol20,
                prior_er=prior_er,
                rv5=rv5,
            )
        )
    return out
