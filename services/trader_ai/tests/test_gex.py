from trader_ai.gex import ChainContract, compute_gex


def test_call_wall_and_put_wall():
    spot = 500.0
    contracts = [
        ChainContract(strike=505, cp="C", oi=10000, gamma=0.02),
        ChainContract(strike=510, cp="C", oi=2000, gamma=0.01),
        ChainContract(strike=495, cp="P", oi=8000, gamma=0.02),
        ChainContract(strike=490, cp="P", oi=1000, gamma=0.01),
    ]
    snap = compute_gex(spot, contracts)
    assert snap.call_wall == 505
    assert snap.put_wall == 495
    assert snap.gamma_sign in ("positive", "negative", "flat")
    assert snap.max_gex_strike in (505, 495)


def test_empty_chain():
    snap = compute_gex(100.0, [])
    assert snap.net_gex == 0
    assert snap.call_wall is None
