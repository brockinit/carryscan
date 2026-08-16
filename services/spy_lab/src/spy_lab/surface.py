"""Build daily option surface summaries from contract rows."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Iterable, Sequence

from spy_lab.bs import price_and_greeks
from spy_lab.config import DTE_TARGETS
from spy_lab.occ import OccContract, dte, parse_occ


@dataclass
class ContractRow:
    ticker: str
    occ: OccContract
    mid: float
    volume: float = 0.0
    oi: int | None = None
    iv: float | None = None
    delta: float | None = None


@dataclass
class SurfaceRow:
    as_of_date: date
    underlying: str
    spot: float
    dte_target: int
    dte_actual: int | None
    expiry: date | None
    iv_atm: float | None
    iv_25d_put: float | None
    iv_25d_call: float | None
    rr_25d: float | None
    bf_25d: float | None
    straddle_mid_atm: float | None
    call_oi: int | None
    put_oi: int | None
    source: str

    def as_dict(self) -> dict:
        return {
            "as_of_date": self.as_of_date.isoformat(),
            "underlying": self.underlying,
            "spot": self.spot,
            "dte_target": self.dte_target,
            "dte_actual": self.dte_actual,
            "expiry": self.expiry.isoformat() if self.expiry else None,
            "iv_atm": self.iv_atm,
            "iv_25d_put": self.iv_25d_put,
            "iv_25d_call": self.iv_25d_call,
            "rr_25d": self.rr_25d,
            "bf_25d": self.bf_25d,
            "straddle_mid_atm": self.straddle_mid_atm,
            "call_oi": self.call_oi,
            "put_oi": self.put_oi,
            "source": self.source,
        }


def enrich_iv(
    rows: Sequence[ContractRow],
    spot: float,
    as_of: date,
    r: float,
) -> list[ContractRow]:
    """Fill missing IV/delta via BS when mid is available."""
    out: list[ContractRow] = []
    for row in rows:
        if row.iv is not None and row.delta is not None:
            out.append(row)
            continue
        t = max(dte(as_of, row.occ.expiry), 0) / 365.0
        if t <= 0 or row.mid <= 0:
            out.append(row)
            continue
        res = price_and_greeks(row.mid, spot, row.occ.strike, t, r, row.occ.cp)
        if res is None:
            out.append(row)
            continue
        out.append(
            ContractRow(
                ticker=row.ticker,
                occ=row.occ,
                mid=row.mid,
                volume=row.volume,
                oi=row.oi,
                iv=res.iv if row.iv is None else row.iv,
                delta=res.delta if row.delta is None else row.delta,
            )
        )
    return out


def _nearest_expiry(rows: Sequence[ContractRow], as_of: date, target_dte: int):
    expiries = sorted({r.occ.expiry for r in rows if r.occ.expiry >= as_of})
    if not expiries:
        return None
    return min(expiries, key=lambda e: abs(dte(as_of, e) - target_dte))


def build_surface(
    as_of: date,
    underlying: str,
    spot: float,
    rows: Sequence[ContractRow],
    *,
    source: str,
    r: float = 0.04,
    dte_targets: Iterable[int] = DTE_TARGETS,
) -> list[SurfaceRow]:
    rows = enrich_iv(list(rows), spot, as_of, r)
    surfaces: list[SurfaceRow] = []
    for target in dte_targets:
        expiry = _nearest_expiry(rows, as_of, target)
        if expiry is None:
            surfaces.append(
                SurfaceRow(
                    as_of_date=as_of,
                    underlying=underlying,
                    spot=spot,
                    dte_target=target,
                    dte_actual=None,
                    expiry=None,
                    iv_atm=None,
                    iv_25d_put=None,
                    iv_25d_call=None,
                    rr_25d=None,
                    bf_25d=None,
                    straddle_mid_atm=None,
                    call_oi=None,
                    put_oi=None,
                    source=source,
                )
            )
            continue
        bucket = [r for r in rows if r.occ.expiry == expiry]
        calls = [r for r in bucket if r.occ.cp == "C" and r.iv is not None]
        puts = [r for r in bucket if r.occ.cp == "P" and r.iv is not None]
        atm_c = min(calls, key=lambda r: abs(r.occ.strike - spot), default=None)
        atm_p = min(puts, key=lambda r: abs(r.occ.strike - spot), default=None)
        put25 = min(puts, key=lambda r: abs((r.delta or 0) - (-0.25)), default=None)
        call25 = min(calls, key=lambda r: abs((r.delta or 0) - 0.25), default=None)

        iv_atm = None
        if atm_c and atm_p and atm_c.iv is not None and atm_p.iv is not None:
            iv_atm = 0.5 * (atm_c.iv + atm_p.iv)
        elif atm_c and atm_c.iv is not None:
            iv_atm = atm_c.iv
        elif atm_p and atm_p.iv is not None:
            iv_atm = atm_p.iv

        iv_p = put25.iv if put25 else None
        iv_c = call25.iv if call25 else None
        rr = (iv_p - iv_c) if iv_p is not None and iv_c is not None else None
        bf = (
            0.5 * (iv_p + iv_c) - iv_atm
            if iv_p is not None and iv_c is not None and iv_atm is not None
            else None
        )
        straddle = None
        if atm_c and atm_p and spot > 0:
            straddle = (atm_c.mid + atm_p.mid) / spot

        surfaces.append(
            SurfaceRow(
                as_of_date=as_of,
                underlying=underlying,
                spot=spot,
                dte_target=target,
                dte_actual=dte(as_of, expiry),
                expiry=expiry,
                iv_atm=iv_atm,
                iv_25d_put=iv_p,
                iv_25d_call=iv_c,
                rr_25d=rr,
                bf_25d=bf,
                straddle_mid_atm=straddle,
                call_oi=sum(r.oi or 0 for r in calls) or None,
                put_oi=sum(r.oi or 0 for r in puts) or None,
                source=source,
            )
        )
    return surfaces


def contracts_from_day_aggs(
    records: Sequence[dict],
    as_of: date,
) -> list[ContractRow]:
    """records: ticker, close, volume, ..."""
    out: list[ContractRow] = []
    for rec in records:
        occ = parse_occ(str(rec["ticker"]))
        if occ is None or occ.root != "SPY":
            continue
        mid = float(rec.get("close") or rec.get("c") or 0)
        if mid <= 0:
            continue
        out.append(
            ContractRow(
                ticker=occ.ticker,
                occ=occ,
                mid=mid,
                volume=float(rec.get("volume") or rec.get("v") or 0),
            )
        )
    return out
