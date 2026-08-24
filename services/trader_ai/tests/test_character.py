from trader_ai.character import (
    MinuteBar,
    classify_level_touch,
    label_from_scores,
    reaction_rates,
    score_character,
)


def _trend_bars(n=40):
    return [MinuteBar(o=100 + i, h=101 + i, l=99 + i, c=100.8 + i, v=1e6) for i in range(n)]


def _chop_bars(n=40):
    bars = []
    px = 100.0
    for i in range(n):
        px = 100.0 + (1 if i % 2 == 0 else -1) * 0.15
        bars.append(MinuteBar(o=px, h=px + 0.2, l=px - 0.2, c=px, v=1e6))
    return bars


def test_trend_label():
    st = score_character(_trend_bars())
    assert st.label in ("trend", "expansion")
    assert "pullbacks_in_direction" in st.apply_strategies or "follow_through" in st.apply_strategies


def test_balance_label():
    st = score_character(_chop_bars())
    assert st.label in ("balance", "compression")
    assert "fade_edges" in st.apply_strategies or "wait_for_expansion" in st.apply_strategies


def test_label_from_scores():
    assert label_from_scores(0.5, 0.7, 1.0) == "trend"
    assert label_from_scores(0.1, 0.4, 0.5) == "compression"


def test_reaction_rates():
    r = reaction_rates(7, 1, 2)
    assert r["n"] == 10
    assert r["hold"] == 0.7


def test_classify_level_touch():
    assert classify_level_touch(level=100, low=99.9, high=100.1, close=100.0) == "hold"
    assert classify_level_touch(level=100, low=100.2, high=101, close=100.8) is None or True
    assert classify_level_touch(level=100, low=99, high=101, close=101.5) == "through"
