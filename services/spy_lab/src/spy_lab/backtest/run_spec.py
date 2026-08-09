"""Deterministic backtest runner for experiment specs."""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import date
from typing import Any

from spy_lab.specs.schema import ExperimentSpec

# Map event gate names → underlying_daily boolean columns
_FLAG = {
    "fomc": "is_fomc",
    "fomc_day_before": "is_fomc_eve",
    "opex": "is_opex",
    "triple_witching": "is_triple_witching",
    "eom": "is_eom",
    "eoq": "is_eoq",
    "vix_opex": "is_vix_opex",
    "half_day": "is_half_day",
    # FMP macro — present on panel if joined via events query; else ignored
    "nfp": "is_nfp",
    "cpi": "is_cpi",
    "high_impact_macro": "is_high_impact_macro",
}


def _as_date(v: Any) -> date:
    if isinstance(v, date):
        return v
    return date.fromisoformat(str(v)[:10])


def _passes_entry(row: dict, spec: ExperimentSpec) -> bool:
    e = spec.entry
    gap = row.get("gap_pct")
    rel = row.get("rel_vol_20")
    if e.rel_vol_max is not None and (rel is None or rel > e.rel_vol_max):
        return False
    if e.rel_vol_min is not None and (rel is None or rel < e.rel_vol_min):
        return False
    if gap is not None:
        ag = abs(gap)
        if e.abs_gap_max is not None and ag > e.abs_gap_max:
            return False
        if e.abs_gap_min is not None and ag < e.abs_gap_min:
            return False
        if e.gap_side == "down" and gap >= 0:
            return False
        if e.gap_side == "up" and gap <= 0:
            return False
    elif e.abs_gap_min is not None or e.gap_side in ("down", "up"):
        return False

    # event gates
    req = spec.event_gates.require_any
    if req:
        ok = False
        for name in req:
            col = _FLAG.get(name)
            if col and row.get(col):
                ok = True
                break
        if not ok:
            return False
    for name in spec.event_gates.exclude_any:
        col = _FLAG.get(name)
        if col and row.get(col):
            return False

    # MOC leakage guard
    if spec.decision_time == "pre_open" and row.get("moc_imbalance_ratio") is not None:
        # Using MOC ratio at pre_open is forbidden — ignore the field (already not in entry)
        pass
    if spec.decision_time == "before_moc":
        # same-day MOC not yet known for research proxy — disallow moc-based filters
        pass
    return True


def _fwd_return(panel: list[dict], i: int, hold: int, field: str) -> float | None:
    if i + hold >= len(panel):
        return None
    a = panel[i].get(field)
    b = panel[i + hold].get(field)
    if a is None or b is None:
        return None
    return float(b) - float(a)


def _trade_pnl(panel: list[dict], i: int, spec: ExperimentSpec) -> float | None:
    hold = spec.hold_days
    cost = spec.cost_bps / 10000.0
    if spec.structure == "iv_short_30d":
        # short IV: profit when IV falls
        chg = _fwd_return(panel, i, hold, "iv_atm")
        if chg is None:
            return None
        return -chg - cost
    if spec.structure == "rr_fade_30d":
        # fade rich put skew: short rr (profit when rr falls)
        rr = panel[i].get("rr_25d")
        if rr is None:
            return None
        chg = _fwd_return(panel, i, hold, "rr_25d")
        if chg is None:
            return None
        # only enter if rr relatively rich vs 0
        if rr < 0:
            return None
        return -chg - cost
    if spec.structure == "underlying_gate":
        c0 = panel[i].get("c")
        c1 = panel[i + hold].get("c") if i + hold < len(panel) else None
        if not c0 or not c1:
            return None
        # long SPY proxy
        return (c1 / c0 - 1.0) - cost
    return None


def _slice_metrics(panel: list[dict], spec: ExperimentSpec) -> dict:
    pnls: list[float] = []
    for i in range(len(panel)):
        if not _passes_entry(panel[i], spec):
            continue
        pnl = _trade_pnl(panel, i, spec)
        if pnl is None:
            continue
        pnls.append(pnl)
    n = len(pnls)
    avg = sum(pnls) / n if n else 0.0
    win = sum(1 for p in pnls if p > 0) / n if n else 0.0
    return {
        "n_trades": n,
        "avg_pnl": avg,
        "win_rate": win,
        "sum_pnl": sum(pnls) if pnls else 0.0,
    }


def judge(train: dict, test: dict, spec: ExperimentSpec) -> tuple[str, str | None]:
    if test["n_trades"] < spec.min_trades:
        return "KILL", f"insufficient N on test ({test['n_trades']} < {spec.min_trades})"
    if spec.kill_if_test_net_le_zero and test["avg_pnl"] <= 0:
        return "KILL", "test_net <= 0 after costs"
    if train["avg_pnl"] > 0 and test["avg_pnl"] > 0:
        decay = (train["avg_pnl"] - test["avg_pnl"]) / train["avg_pnl"]
        if decay > spec.kill_if_decay_gt:
            return "KILL", f"train/test decay {decay:.2f} > {spec.kill_if_decay_gt}"
    if test["avg_pnl"] > 0 and test["n_trades"] >= spec.min_trades:
        return "HOLD", None
    return "KILL", "did not meet promote heuristics"


def run_spec(spec: ExperimentSpec, panel: list[dict]) -> dict:
    """Run walk-forward on an in-memory panel (list of dict rows sorted by date)."""
    train_a, train_b = date.fromisoformat(spec.train_start), date.fromisoformat(spec.train_end)
    test_a, test_b = date.fromisoformat(spec.test_start), date.fromisoformat(spec.test_end)
    train_panel = [r for r in panel if train_a <= _as_date(r["as_of_date"]) <= train_b]
    test_panel = [r for r in panel if test_a <= _as_date(r["as_of_date"]) <= test_b]
    train_m = _slice_metrics(train_panel, spec)
    test_m = _slice_metrics(test_panel, spec)
    verdict, reason = judge(train_m, test_m, spec)
    spec_hash = hashlib.sha256(
        json.dumps(spec.model_dump(), sort_keys=True).encode()
    ).hexdigest()[:16]
    return {
        "run_id": str(uuid.uuid4()),
        "experiment_id": spec.id,
        "spec_hash": spec_hash,
        "title": spec.title,
        "train": train_m,
        "test": test_m,
        "verdict": verdict,
        "kill_reason": reason,
        "primary_metric": test_m["avg_pnl"],
        "n_trades": test_m["n_trades"],
        "train_metric": train_m["avg_pnl"],
        "test_metric": test_m["avg_pnl"],
        "spec": spec.model_dump(),
    }
