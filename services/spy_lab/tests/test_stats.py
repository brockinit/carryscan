from spy_lab.backtest.stats import bootstrap_ci, enrich_metrics, t_stat


def test_t_stat_known_mean():
    # all +1 → mean 1, var 0 → None
    assert t_stat([1.0, 1.0, 1.0]) is None
    s = t_stat([1.0, 2.0, 3.0, 4.0])
    assert s is not None and s > 0


def test_bootstrap_ci_deterministic_and_covers_mean():
    pnls = [0.1, -0.02, 0.08, 0.03, -0.01, 0.05]
    lo, hi = bootstrap_ci(pnls, seed=7)
    assert lo is not None and hi is not None
    assert lo <= sum(pnls) / len(pnls) <= hi
    lo2, hi2 = bootstrap_ci(pnls, seed=7)
    assert (lo, hi) == (lo2, hi2)


def test_enrich_metrics_flags_multiple_testing():
    base = {"n_trades": 4, "avg_pnl": 0.1, "win_rate": 0.75, "sum_pnl": 0.4}
    out = enrich_metrics(base, [0.1, 0.2, -0.05, 0.15], week_spec_count=6)
    assert out["t_stat"] is not None
    assert out["multiple_testing_note"] and "6 specs" in out["multiple_testing_note"]
