from trader_ai.flow import ad_increment, infer_note, rollup_daily


def test_ad_positive_when_close_near_high():
    assert ad_increment(10, 12, 10, 12, 1000) > 0
    assert ad_increment(10, 12, 10, 10, 1000) < 0


def test_note_never_says_institutions():
    n = infer_note(
        rel_vol_20=2.0,
        ad_delta=1e6,
        call_oi_change=5000,
        put_oi_change=0,
        unusual_premium=80_000,
    )
    assert "inferred" in n
    assert "institution" not in n.lower()


def test_rollup_daily_shape():
    row = rollup_daily(
        "SPY",
        "2026-08-24",
        o=500,
        h=505,
        l=498,
        c=504,
        volume=8e7,
        vol20=4e7,
        prior_ad=0,
        call_oi=1e6,
        prior_call_oi=9e5,
        put_oi=8e5,
        prior_put_oi=8e5,
        unusual_premium=1e5,
    )
    assert row.rel_vol_20 == 2.0
    assert row.call_oi_change == 1e5
    assert row.note.startswith("inferred")
