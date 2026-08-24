"""Timescale helpers. Optional — engines work without a live DB."""
from __future__ import annotations

import json
from contextlib import contextmanager
from typing import Any, Iterator, Sequence

from trader_ai.config import Settings, get_settings


def _connect(url: str):
    import psycopg

    return psycopg.connect(url)


@contextmanager
def cursor(settings: Settings | None = None) -> Iterator[Any]:
    s = settings or get_settings()
    conn = _connect(s.database_url)
    try:
        with conn.cursor() as cur:
            yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def execute(sql: str, params: Sequence[Any] | None = None, *, settings: Settings | None = None) -> None:
    try:
        with cursor(settings) as cur:
            cur.execute(sql, params)
    except Exception as e:
        raise RuntimeError(f"db write failed: {e}") from e


def fetchall(sql: str, params: Sequence[Any] | None = None, *, settings: Settings | None = None) -> list[dict]:
    try:
        with cursor(settings) as cur:
            cur.execute(sql, params)
            if cur.description is None:
                return []
            cols = [d.name for d in cur.description]
            return [dict(zip(cols, row)) for row in cur.fetchall()]
    except Exception:
        return []


def fetchone(sql: str, params: Sequence[Any] | None = None, *, settings: Settings | None = None) -> dict | None:
    rows = fetchall(sql, params, settings=settings)
    return rows[0] if rows else None


def dumps(obj: Any) -> str:
    return json.dumps(obj, default=str)
