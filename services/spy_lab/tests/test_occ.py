from datetime import date

from spy_lab.occ import dte, is_spy_option, parse_occ


def test_parse_spy_put():
    c = parse_occ("O:SPY230327P00390000")
    assert c is not None
    assert c.root == "SPY"
    assert c.expiry == date(2023, 3, 27)
    assert c.cp == "P"
    assert c.strike == 390.0


def test_parse_spy_call():
    c = parse_occ("O:SPY240920C00500000")
    assert c is not None
    assert c.cp == "C"
    assert c.strike == 500.0


def test_reject_non_occ():
    assert parse_occ("SPY") is None
    assert parse_occ("O:AAPL240920C00100000") is not None
    assert is_spy_option("O:AAPL240920C00100000") is False
    assert is_spy_option("O:SPY240920C00100000") is True


def test_dte():
    assert dte(date(2024, 1, 1), date(2024, 1, 31)) == 30
