from datetime import date, timedelta

from spy_lab.backtest.run_spec import run_spec
from spy_lab.jobs.experiments import load_specs
from spy_lab.specs.schema import EntryRules, EventGates, ExperimentSpec


def _panel(n: int = 120):
    start = date(2020, 1, 2)
    rows = []
    px = 300.0
    iv = 0.20
    for i in range(n):
        d = start + timedelta(days=i)
        if d.weekday() >= 5:
            continue
        px *= 1.001
        iv *= 0.999
        rows.append(
            {
                "as_of_date": d,
                "c": px,
                "gap_pct": -0.01 if i % 7 == 0 else 0.0,
                "rel_vol_20": 0.7,
                "iv_atm": iv,
                "rr_25d": 0.02,
                "is_fomc": False,
                "is_fomc_eve": i % 40 == 0,
                "is_opex": False,
                "is_triple_witching": False,
                "is_eom": False,
                "is_eoq": False,
                "is_vix_opex": False,
                "is_half_day": False,
                "is_nfp": False,
                "is_cpi": False,
                "is_high_impact_macro": False,
                "moc_imbalance_ratio": None,
            }
        )
    return rows


def test_run_spec_iv_short():
    panel = _panel()
    dates = [r["as_of_date"] for r in panel]
    spec = ExperimentSpec(
        id="t1",
        title="test",
        structure="iv_short_30d",
        hold_days=5,
        entry=EntryRules(rel_vol_max=1.0, abs_gap_min=0.005, gap_side="down"),
        event_gates=EventGates(),
        train_start=dates[0].isoformat(),
        train_end=dates[len(dates) // 2].isoformat(),
        test_start=dates[len(dates) // 2 + 1].isoformat(),
        test_end=dates[-1].isoformat(),
        min_trades=1,
    )
    result = run_spec(spec, panel)
    assert result["verdict"] in ("KILL", "HOLD")
    assert "run_id" in result


def test_blocked_without_0dte_clock():
    panel = _panel()
    dates = [r["as_of_date"] for r in panel]
    spec = ExperimentSpec(
        id="h01",
        title="blocked",
        structure="pin_range_compress",
        data_requirements=["vix", "odte_max_oi_dist_pct_1000et"],
        train_start=dates[0].isoformat(),
        train_end=dates[10].isoformat(),
        test_start=dates[11].isoformat(),
        test_end=dates[-1].isoformat(),
        min_trades=1,
    )
    result = run_spec(spec, panel)
    assert result["verdict"] == "DATA_BLOCKED"
    assert "odte_max_oi_dist_pct_1000et" in (result["kill_reason"] or "")


def test_opex_vs_next_range():
    panel = _panel()
    # every 10th row is opex; next day has a wider |O-C|
    for i, row in enumerate(panel):
        row["o"] = 100.0
        row["c"] = 100.2 if i % 10 == 0 else 101.5
        row["is_opex"] = i % 10 == 0
    dates = [r["as_of_date"] for r in panel]
    spec = ExperimentSpec(
        id="h06",
        title="opex vs next",
        structure="opex_vs_next_oc_range",
        hold_days=1,
        event_gates=EventGates(require_any=["opex"]),
        train_start=dates[0].isoformat(),
        train_end=dates[len(dates) // 2].isoformat(),
        test_start=dates[len(dates) // 2 + 1].isoformat(),
        test_end=dates[-1].isoformat(),
        min_trades=1,
    )
    result = run_spec(spec, panel)
    assert result["test"]["n_trades"] >= 1
    assert result["test"]["avg_pnl"] > 0


def test_new_seeds_validate():
    specs = load_specs()
    ids = {s.id for s in specs}
    assert "h01_pin_range_compress_v1" in ids
    assert "h05_opex_pin_1400_vs_1000_v1" in ids
    assert "h06_post_opex_oc_range_v1" in ids
    assert "h09_wait_for_body_print_v1" in ids
