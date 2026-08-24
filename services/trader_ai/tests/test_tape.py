from datetime import datetime
from zoneinfo import ZoneInfo

from trader_ai.tape import clock_label, is_rth, notable_from_print

ET = ZoneInfo("America/New_York")


def test_rth_weekday_open():
    ts = datetime(2026, 8, 24, 10, 0, tzinfo=ET)  # Monday
    assert is_rth(ts)
    assert not is_rth(datetime(2026, 8, 22, 10, 0, tzinfo=ET))  # Saturday
    assert not is_rth(datetime(2026, 8, 24, 8, 0, tzinfo=ET))


def test_clocks():
    assert clock_label(datetime(2026, 8, 24, 10, 0, tzinfo=ET)) == "1000et"
    assert clock_label(datetime(2026, 8, 24, 14, 0, tzinfo=ET)) == "1400et"
    assert clock_label(datetime(2026, 8, 24, 11, 0, tzinfo=ET)) is None


def test_notable_threshold():
    assert notable_from_print(60_000, 10)
    assert notable_from_print(100, 250)
    assert not notable_from_print(100, 10)
