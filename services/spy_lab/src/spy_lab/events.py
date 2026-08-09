"""Force-flow event calendars: computed OPEX/EOM + FMP economic calendar."""
from __future__ import annotations

import json
from calendar import monthcalendar
from datetime import date, timedelta
from pathlib import Path
from typing import Iterable

from spy_lab.config import DATA_DIR
from spy_lab.fmp import FmpClient, fmp_events_to_market_events

# NYSE observed holidays (static; extend yearly). Format YYYY-MM-DD.
_DEFAULT_HOLIDAYS = [
    # 2014–2026 partial — good enough for half-day / eve flags; FMP fills macro
    "2014-01-01", "2014-01-20", "2014-02-17", "2014-04-18", "2014-05-26",
    "2014-07-04", "2014-09-01", "2014-11-27", "2014-12-25",
    "2015-01-01", "2015-01-19", "2015-02-16", "2015-04-03", "2015-05-25",
    "2015-07-03", "2015-09-07", "2015-11-26", "2015-12-25",
    "2016-01-01", "2016-01-18", "2016-02-15", "2016-03-25", "2016-05-30",
    "2016-07-04", "2016-09-05", "2016-11-24", "2016-12-26",
    "2017-01-02", "2017-01-16", "2017-02-20", "2017-04-14", "2017-05-29",
    "2017-07-04", "2017-09-04", "2017-11-23", "2017-12-25",
    "2018-01-01", "2018-01-15", "2018-02-19", "2018-03-30", "2018-05-28",
    "2018-07-04", "2018-09-03", "2018-11-22", "2018-12-25",
    "2019-01-01", "2019-01-21", "2019-02-18", "2019-04-19", "2019-05-27",
    "2019-07-04", "2019-09-02", "2019-11-28", "2019-12-25",
    "2020-01-01", "2020-01-20", "2020-02-17", "2020-04-10", "2020-05-25",
    "2020-07-03", "2020-09-07", "2020-11-26", "2020-12-25",
    "2021-01-01", "2021-01-18", "2021-02-15", "2021-04-02", "2021-05-31",
    "2021-07-05", "2021-09-06", "2021-11-25", "2021-12-24",
    "2022-01-17", "2022-02-21", "2022-04-15", "2022-05-30", "2022-06-20",
    "2022-07-04", "2022-09-05", "2022-11-24", "2022-12-26",
    "2023-01-02", "2023-01-16", "2023-02-20", "2023-04-07", "2023-05-29",
    "2023-06-19", "2023-07-04", "2023-09-04", "2023-11-23", "2023-12-25",
    "2024-01-01", "2024-01-15", "2024-02-19", "2024-03-29", "2024-05-27",
    "2024-06-19", "2024-07-04", "2024-09-02", "2024-11-28", "2024-12-25",
    "2025-01-01", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26",
    "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25",
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
    "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
]


def _load_json_dates(path: Path, key: str | None = None) -> set[date]:
    if not path.exists():
        return set()
    data = json.loads(path.read_text())
    if key:
        data = data.get(key, [])
    out: set[date] = set()
    for item in data:
        if isinstance(item, str):
            out.add(date.fromisoformat(item[:10]))
        elif isinstance(item, dict) and "date" in item:
            out.add(date.fromisoformat(str(item["date"])[:10]))
    return out


def load_holidays() -> set[date]:
    path = DATA_DIR / "nyse_holidays.json"
    loaded = _load_json_dates(path)
    if loaded:
        return loaded
    return {date.fromisoformat(d) for d in _DEFAULT_HOLIDAYS}


def third_friday(year: int, month: int) -> date:
    cal = monthcalendar(year, month)
    fridays = [week[4] for week in cal if week[4] != 0]
    return date(year, month, fridays[2])


def iter_trading_days(start: date, end: date, holidays: set[date]) -> list[date]:
    out: list[date] = []
    d = start
    while d <= end:
        if d.weekday() < 5 and d not in holidays:
            out.append(d)
        d += timedelta(days=1)
    return out


def previous_trading_day(d: date, holidays: set[date]) -> date:
    x = d - timedelta(days=1)
    while x.weekday() >= 5 or x in holidays:
        x -= timedelta(days=1)
    return x


def build_computed_events(start: date, end: date) -> list[dict]:
    holidays = load_holidays()
    events: list[dict] = []
    # Holidays / half-days (July 3 sometimes, day after Thanksgiving)
    for h in sorted(holidays):
        if start <= h <= end:
            events.append(
                {
                    "as_of_date": h.isoformat(),
                    "event_type": "holiday",
                    "severity": "info",
                    "source": "calendar",
                    "meta": {},
                }
            )
            eve = previous_trading_day(h, holidays)
            if start <= eve <= end:
                events.append(
                    {
                        "as_of_date": eve.isoformat(),
                        "event_type": "holiday_eve",
                        "severity": "info",
                        "source": "calendar",
                        "meta": {"holiday": h.isoformat()},
                    }
                )

    # OPEX / triple witching / VIX opex
    y, m = start.year, start.month
    while date(y, m, 1) <= end:
        opex = third_friday(y, m)
        if start <= opex <= end and opex not in holidays:
            twin = m in (3, 6, 9, 12)
            events.append(
                {
                    "as_of_date": opex.isoformat(),
                    "event_type": "triple_witching" if twin else "opex",
                    "severity": "high" if twin else "notable",
                    "source": "computed",
                    "meta": {},
                }
            )
            # VIX futures typically expire Wednesday before monthly SPX/SPY opex
            vix = opex - timedelta(days=2)  # Fri - 2 = Wed
            while vix.weekday() >= 5 or vix in holidays:
                vix -= timedelta(days=1)
            if start <= vix <= end:
                events.append(
                    {
                        "as_of_date": vix.isoformat(),
                        "event_type": "vix_opex",
                        "severity": "notable",
                        "source": "computed",
                        "meta": {"related_opex": opex.isoformat()},
                    }
                )
        # next month
        if m == 12:
            y, m = y + 1, 1
        else:
            m += 1

    # EOM / EOQ last trading days
    trading = iter_trading_days(start, end + timedelta(days=40), holidays)
    by_month: dict[tuple[int, int], date] = {}
    for d in trading:
        by_month[(d.year, d.month)] = d
    for (yy, mm), last in by_month.items():
        if not (start <= last <= end):
            continue
        events.append(
            {
                "as_of_date": last.isoformat(),
                "event_type": "eom",
                "severity": "notable",
                "source": "computed",
                "meta": {},
            }
        )
        if mm in (3, 6, 9, 12):
            events.append(
                {
                    "as_of_date": last.isoformat(),
                    "event_type": "eoq",
                    "severity": "high",
                    "source": "computed",
                    "meta": {},
                }
            )

    # Static FOMC fallback file (supplement FMP)
    fomc_path = DATA_DIR / "fomc_dates.json"
    for d in _load_json_dates(fomc_path, key="dates") or _load_json_dates(fomc_path):
        if start <= d <= end:
            events.append(
                {
                    "as_of_date": d.isoformat(),
                    "event_type": "fomc",
                    "severity": "high",
                    "source": "calendar",
                    "meta": {},
                }
            )
            eve = previous_trading_day(d, holidays)
            if start <= eve <= end:
                events.append(
                    {
                        "as_of_date": eve.isoformat(),
                        "event_type": "fomc_day_before",
                        "severity": "notable",
                        "source": "calendar",
                        "meta": {"fomc": d.isoformat()},
                    }
                )
    return events


def build_fmp_events(start: date, end: date, client: FmpClient | None = None) -> list[dict]:
    client = client or FmpClient()
    if not client.enabled:
        return []
    raw = client.economic_calendar(start, end)
    events = fmp_events_to_market_events(raw)
    # Add fomc_day_before for FMP FOMC days
    holidays = load_holidays()
    extras: list[dict] = []
    for e in events:
        if e["event_type"] != "fomc":
            continue
        d = date.fromisoformat(e["as_of_date"])
        eve = previous_trading_day(d, holidays)
        if start <= eve <= end:
            extras.append(
                {
                    "as_of_date": eve.isoformat(),
                    "event_type": "fomc_day_before",
                    "severity": "notable",
                    "source": "fmp",
                    "meta": {"fomc": d.isoformat()},
                }
            )
    return events + extras


def build_all_events(
    start: date,
    end: date,
    *,
    use_fmp: bool = True,
) -> list[dict]:
    events = build_computed_events(start, end)
    if use_fmp:
        events.extend(build_fmp_events(start, end))
    # Dedupe by (date, type, source) preferring fmp for fomc
    seen: set[tuple[str, str]] = set()
    out: list[dict] = []
    # Prefer FMP rows first for overlapping types
    events_sorted = sorted(
        events, key=lambda e: (0 if e.get("source") == "fmp" else 1)
    )
    for e in events_sorted:
        key = (e["as_of_date"], e["event_type"])
        if key in seen:
            continue
        seen.add(key)
        out.append(e)
    return out


def event_flags_for_date(
    d: date,
    events: Iterable[dict],
    trading_days: list[date],
) -> dict:
    types = {e["event_type"] for e in events if e["as_of_date"] == d.isoformat()}
    fomc_dates = sorted(
        date.fromisoformat(e["as_of_date"])
        for e in events
        if e["event_type"] == "fomc"
    )
    opex_dates = sorted(
        date.fromisoformat(e["as_of_date"])
        for e in events
        if e["event_type"] in ("opex", "triple_witching")
    )

    def days_until(targets: list[date]) -> int | None:
        future = [t for t in targets if t >= d]
        if not future:
            return None
        # count trading days
        end = future[0]
        return sum(1 for td in trading_days if d <= td < end)

    return {
        "is_fomc": "fomc" in types,
        "is_fomc_eve": "fomc_day_before" in types,
        "is_opex": "opex" in types or "triple_witching" in types,
        "is_triple_witching": "triple_witching" in types,
        "is_eom": "eom" in types,
        "is_eoq": "eoq" in types,
        "is_vix_opex": "vix_opex" in types,
        "is_half_day": "half_day" in types,
        "is_nfp": "nfp" in types,
        "is_cpi": "cpi" in types or "core_cpi" in types,
        "is_high_impact_macro": "high_impact_macro" in types
        or "nfp" in types
        or "cpi" in types
        or "fomc" in types
        or "pce" in types,
        "days_to_fomc": days_until(fomc_dates),
        "days_to_opex": days_until(opex_dates),
        "moc_imbalance_ratio": None,
    }
