from datetime import date

from spy_lab.events import build_computed_events, third_friday


def test_third_friday():
    assert third_friday(2024, 3) == date(2024, 3, 15)


def test_opex_and_eom_present():
    events = build_computed_events(date(2024, 3, 1), date(2024, 3, 31))
    types = {e["event_type"] for e in events}
    assert "triple_witching" in types or "opex" in types
    assert "eom" in types
    assert "eoq" in types
