"""OCC option ticker parsing (Massive / Polygon style O:ROOT...)."""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime

# O:SPY230327P00390000 or O:SPY230327C00400000
_OCC_RE = re.compile(
    r"^O:(?P<root>[A-Z]+)(?P<yy>\d{2})(?P<mm>\d{2})(?P<dd>\d{2})"
    r"(?P<cp>[CP])(?P<strike>\d{8})$"
)


@dataclass(frozen=True)
class OccContract:
    ticker: str
    root: str
    expiry: date
    cp: str  # "C" | "P"
    strike: float


def parse_occ(ticker: str) -> OccContract | None:
    """Parse Massive options ticker. Returns None if not OCC-shaped."""
    m = _OCC_RE.match(ticker.strip().upper())
    if not m:
        return None
    yy = int(m.group("yy"))
    year = 2000 + yy if yy < 80 else 1900 + yy
    try:
        expiry = date(year, int(m.group("mm")), int(m.group("dd")))
    except ValueError:
        return None
    # Strike encoded as price * 1000, zero-padded to 8 digits
    strike = int(m.group("strike")) / 1000.0
    return OccContract(
        ticker=ticker.strip().upper(),
        root=m.group("root"),
        expiry=expiry,
        cp=m.group("cp"),
        strike=strike,
    )


def is_spy_option(ticker: str) -> bool:
    t = ticker.strip().upper()
    return t.startswith("O:SPY") and parse_occ(t) is not None


def dte(as_of: date, expiry: date) -> int:
    return (expiry - as_of).days


def as_of_from_window_start_ns(window_start_ns: int) -> date:
    """Flat-file window_start is Unix nanoseconds."""
    return datetime.utcfromtimestamp(window_start_ns / 1e9).date()
