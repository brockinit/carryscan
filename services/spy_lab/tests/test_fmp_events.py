from spy_lab.fmp import classify_fmp_event, fmp_events_to_market_events


def test_classify_fomc_nfp_cpi():
    assert classify_fmp_event("FOMC Meeting Minutes") == "fomc"
    assert classify_fmp_event("Nonfarm Payrolls") == "nfp"
    assert classify_fmp_event("CPI") == "cpi"


def test_fmp_rows_to_events():
    rows = [
        {
            "date": "2024-06-12 14:00:00",
            "country": "US",
            "event": "Fed Interest Rate Decision",
            "impact": "High",
        },
        {
            "date": "2024-06-07",
            "country": "US",
            "event": "Nonfarm Payrolls",
            "impact": "High",
        },
        {
            "date": "2024-06-01",
            "country": "DE",
            "event": "CPI",
            "impact": "High",
        },
    ]
    events = fmp_events_to_market_events(rows)
    types = {(e["as_of_date"], e["event_type"], e["source"]) for e in events}
    assert ("2024-06-12", "fomc", "fmp") in types
    assert ("2024-06-07", "nfp", "fmp") in types
    assert all(e["as_of_date"] != "2024-06-01" for e in events)
