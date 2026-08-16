"""Read Massive option_day_aggs flat files from GCS; filter O:SPY*."""
from __future__ import annotations

import csv
import gzip
import io
from datetime import date
from typing import Iterator

from google.cloud.storage import Client

from spy_lab.config import Settings, get_settings
from spy_lab.occ import as_of_from_window_start_ns, parse_occ


def day_blob_path(prefix: str, d: date) -> str:
    return f"{prefix}/{d.year:04d}/{d.month:02d}/{d.isoformat()}.csv.gz"


def day_gcs_uri(d: date, settings: Settings | None = None) -> str:
    """gs:// URI for one Massive option_day_aggs file. BQ loads this in-region."""
    settings = settings or get_settings()
    return f"gs://{settings.gcs_bucket}/{day_blob_path(settings.gcs_day_aggs_prefix, d)}"


def list_day_paths(
    start: date,
    end: date,
    settings: Settings | None = None,
) -> list[tuple[date, str]]:
    settings = settings or get_settings()
    client = Client(project=settings.gcp_project)
    bucket = client.bucket(settings.gcs_bucket)
    out: list[tuple[date, str]] = []
    # Walk year/month prefixes
    y, m = start.year, start.month
    while date(y, m, 1) <= end:
        prefix = f"{settings.gcs_day_aggs_prefix}/{y:04d}/{m:02d}/"
        for blob in client.list_blobs(bucket, prefix=prefix):
            name = blob.name.rsplit("/", 1)[-1]
            if not name.endswith(".csv.gz"):
                continue
            d_str = name.replace(".csv.gz", "")
            try:
                d = date.fromisoformat(d_str)
            except ValueError:
                continue
            if start <= d <= end:
                out.append((d, blob.name))
        if m == 12:
            y, m = y + 1, 1
        else:
            m += 1
    out.sort(key=lambda x: x[0])
    return out


def iter_spy_rows_from_blob(
    blob_name: str,
    settings: Settings | None = None,
) -> Iterator[dict]:
    settings = settings or get_settings()
    client = Client(project=settings.gcp_project)
    bucket = client.bucket(settings.gcs_bucket)
    blob = bucket.blob(blob_name)
    raw = blob.download_as_bytes()
    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as gz:
        text = io.TextIOWrapper(gz, encoding="utf-8")
        reader = csv.DictReader(text)
        for row in reader:
            ticker = (row.get("ticker") or "").strip()
            if not ticker.upper().startswith("O:SPY"):
                continue
            if parse_occ(ticker) is None:
                continue
            yield row


def load_spy_day(
    d: date,
    settings: Settings | None = None,
) -> tuple[date, list[dict]]:
    settings = settings or get_settings()
    path = day_blob_path(settings.gcs_day_aggs_prefix, d)
    rows = []
    as_of = d
    for row in iter_spy_rows_from_blob(path, settings):
        ws = row.get("window_start")
        if ws:
            try:
                as_of = as_of_from_window_start_ns(int(float(ws)))
            except (TypeError, ValueError):
                pass
        rows.append(
            {
                "ticker": row["ticker"],
                "open": float(row["open"]) if row.get("open") else None,
                "high": float(row["high"]) if row.get("high") else None,
                "low": float(row["low"]) if row.get("low") else None,
                "close": float(row["close"]) if row.get("close") else None,
                "volume": float(row["volume"]) if row.get("volume") else 0,
                "transactions": int(float(row["transactions"]))
                if row.get("transactions")
                else 0,
                "window_start": row.get("window_start"),
            }
        )
    return as_of, rows
