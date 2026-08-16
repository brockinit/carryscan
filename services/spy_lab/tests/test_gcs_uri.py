from datetime import date

from spy_lab.gcs_day_aggs import day_blob_path, day_gcs_uri
from spy_lab.occ import parse_occ


def test_day_blob_path():
    assert (
        day_blob_path("option_day_aggs", date(2024, 1, 2))
        == "option_day_aggs/2024/01/2024-01-02.csv.gz"
    )


def test_day_gcs_uri_default_bucket():
    uri = day_gcs_uri(date(2024, 3, 15))
    assert uri.endswith("/option_day_aggs/2024/03/2024-03-15.csv.gz")
    assert uri.startswith("gs://")


def test_sql_spy_occ_pattern_matches_parser():
    """Keep BQ REGEXP and parse_occ in lockstep."""
    import re

    pat = re.compile(r"^O:SPY\d{6}[CP]\d{8}$")
    good = "O:SPY230327P00390000"
    assert pat.match(good)
    occ = parse_occ(good)
    assert occ is not None and occ.root == "SPY" and occ.strike == 390.0
    assert not pat.match("O:SPYD230327C00050000")
    assert not pat.match("O:AAPL230327C00100000")
