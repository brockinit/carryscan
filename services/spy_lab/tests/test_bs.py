from spy_lab.bs import bs_price, implied_vol, price_and_greeks


def test_atm_call_roundtrip():
    spot, strike, t, r, sig = 100.0, 100.0, 0.25, 0.04, 0.2
    px = bs_price(spot, strike, t, r, sig, "C")
    iv = implied_vol(px, spot, strike, t, r, "C")
    assert iv is not None
    assert abs(iv - sig) < 1e-3


def test_put_greeks():
    res = price_and_greeks(5.0, 100.0, 100.0, 0.5, 0.04, "P")
    assert res is not None
    assert res.iv > 0
    assert res.delta < 0
