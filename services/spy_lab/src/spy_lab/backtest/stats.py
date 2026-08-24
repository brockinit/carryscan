"""Walk-forward metrics beyond raw average: t-stat + bootstrap CI."""
from __future__ import annotations

import math
from typing import Sequence


def t_stat(pnls: Sequence[float]) -> float | None:
    n = len(pnls)
    if n < 2:
        return None
    mean = sum(pnls) / n
    var = sum((p - mean) ** 2 for p in pnls) / (n - 1)
    if var <= 0:
        return None
    return mean / math.sqrt(var / n)


def bootstrap_ci(
    pnls: Sequence[float],
    *,
    n_boot: int = 1000,
    alpha: float = 0.05,
    seed: int = 0,
) -> tuple[float | None, float | None]:
    """Percentile CI on the mean. Deterministic LCG — no numpy required."""
    n = len(pnls)
    if n < 2:
        return None, None
    state = seed & 0xFFFFFFFF
    means: list[float] = []
    for _ in range(n_boot):
        acc = 0.0
        for _i in range(n):
            state = (1664525 * state + 1013904223) & 0xFFFFFFFF
            acc += pnls[state % n]
        means.append(acc / n)
    means.sort()
    lo_i = int(alpha / 2 * n_boot)
    hi_i = min(n_boot - 1, int((1 - alpha / 2) * n_boot))
    return means[lo_i], means[hi_i]


def enrich_metrics(
    base: dict,
    pnls: Sequence[float],
    *,
    week_spec_count: int | None = None,
) -> dict:
    out = dict(base)
    ts = t_stat(pnls)
    lo, hi = bootstrap_ci(pnls)
    out["t_stat"] = ts
    out["ci_low"] = lo
    out["ci_high"] = hi
    if week_spec_count is not None and week_spec_count > 1:
        out["multiple_testing_note"] = (
            f"{week_spec_count} specs scored this week — treat p-values as exploratory"
        )
    else:
        out["multiple_testing_note"] = None
    return out
