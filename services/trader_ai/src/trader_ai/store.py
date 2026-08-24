"""CRUD for journal, behaviors, playbook, memory, briefs, tape rows."""
from __future__ import annotations

from typing import Any

from trader_ai import db
from trader_ai.config import Settings
from trader_ai.embeddings import cosine, embed


def insert_trade(row: dict, *, settings: Settings | None = None) -> int:
    rec = db.fetchone(
        """
        INSERT INTO trades (ticker, structure, side, size, entry, exit, tags, thesis, opened_at, closed_at)
        VALUES (%(ticker)s, %(structure)s, %(side)s, %(size)s, %(entry)s, %(exit)s, %(tags)s, %(thesis)s, %(opened_at)s, %(closed_at)s)
        RETURNING id
        """,
        {
            "ticker": row["ticker"],
            "structure": row.get("structure"),
            "side": row.get("side"),
            "size": row.get("size"),
            "entry": row.get("entry"),
            "exit": row.get("exit"),
            "tags": row.get("tags") or [],
            "thesis": row.get("thesis"),
            "opened_at": row.get("opened_at"),
            "closed_at": row.get("closed_at"),
        },
        settings=settings,
    )
    return int(rec["id"]) if rec else 0


def insert_journal(row: dict, *, settings: Settings | None = None) -> int:
    rec = db.fetchone(
        """
        INSERT INTO journal_entries (trade_id, as_of, body, setup, emotion, rule_followed)
        VALUES (%(trade_id)s, %(as_of)s, %(body)s, %(setup)s, %(emotion)s, %(rule_followed)s)
        RETURNING id
        """,
        {
            "trade_id": row.get("trade_id"),
            "as_of": row.get("as_of"),
            "body": row["body"],
            "setup": row.get("setup"),
            "emotion": row.get("emotion"),
            "rule_followed": row.get("rule_followed"),
        },
        settings=settings,
    )
    jid = int(rec["id"]) if rec else 0
    remember("journal", str(jid), row["body"], settings=settings)
    return jid


def list_journal(limit: int = 50, *, settings: Settings | None = None) -> list[dict]:
    return db.fetchall(
        "SELECT * FROM journal_entries ORDER BY created_at DESC LIMIT %s",
        (limit,),
        settings=settings,
    )


def list_trades(limit: int = 50, *, settings: Settings | None = None) -> list[dict]:
    return db.fetchall(
        "SELECT * FROM trades ORDER BY created_at DESC LIMIT %s",
        (limit,),
        settings=settings,
    )


def upsert_behavior(row: dict, *, settings: Settings | None = None) -> None:
    db.execute(
        """
        INSERT INTO behaviors (id, title, trigger, expected, status, linked_spec_id, evidence)
        VALUES (%(id)s, %(title)s, %(trigger)s::jsonb, %(expected)s, %(status)s, %(linked_spec_id)s, %(evidence)s::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          trigger = EXCLUDED.trigger,
          expected = EXCLUDED.expected,
          status = EXCLUDED.status,
          linked_spec_id = EXCLUDED.linked_spec_id,
          evidence = EXCLUDED.evidence,
          updated_at = now()
        """,
        {
            "id": row["id"],
            "title": row["title"],
            "trigger": db.dumps(row.get("trigger") or {}),
            "expected": row["expected"],
            "status": row.get("status") or "draft",
            "linked_spec_id": row.get("linked_spec_id"),
            "evidence": db.dumps(row.get("evidence") or {}),
        },
        settings=settings,
    )
    remember("behavior", row["id"], f"{row['title']}: {row['expected']}", settings=settings)


def set_behavior_status(bid: str, status: str, *, settings: Settings | None = None) -> None:
    db.execute(
        "UPDATE behaviors SET status = %s, updated_at = now() WHERE id = %s",
        (status, bid),
        settings=settings,
    )


def list_behaviors(status: str | None = None, *, settings: Settings | None = None) -> list[dict]:
    if status:
        return db.fetchall(
            "SELECT * FROM behaviors WHERE status = %s ORDER BY updated_at DESC",
            (status,),
            settings=settings,
        )
    return db.fetchall("SELECT * FROM behaviors ORDER BY updated_at DESC", settings=settings)


def upsert_playbook(rid: str, body: str, *, settings: Settings | None = None) -> int:
    existing = db.fetchone(
        "SELECT version FROM playbook_rules WHERE id = %s", (rid,), settings=settings
    )
    version = (existing["version"] + 1) if existing else 1
    if existing:
        db.execute(
            """
            INSERT INTO playbook_rule_versions (id, version, body)
            SELECT id, version, body FROM playbook_rules WHERE id = %s
            """,
            (rid,),
            settings=settings,
        )
        db.execute(
            "UPDATE playbook_rules SET body = %s, version = %s, updated_at = now() WHERE id = %s",
            (body, version, rid),
            settings=settings,
        )
    else:
        db.execute(
            "INSERT INTO playbook_rules (id, version, body) VALUES (%s, %s, %s)",
            (rid, version, body),
            settings=settings,
        )
    remember("playbook", rid, body, settings=settings)
    return version


def list_playbook(*, settings: Settings | None = None) -> list[dict]:
    return db.fetchall(
        "SELECT * FROM playbook_rules WHERE active ORDER BY id",
        settings=settings,
    )


def remember(source_type: str, source_id: str, body: str, *, settings: Settings | None = None) -> None:
    vec = embed(body, settings)
    db.execute(
        """
        INSERT INTO memory_chunks (source_type, source_id, body, embedding)
        VALUES (%s, %s, %s, %s)
        """,
        (source_type, source_id, body, vec),
        settings=settings,
    )


def search_memory(query: str, *, k: int = 8, settings: Settings | None = None) -> list[dict]:
    q = embed(query, settings)
    rows = db.fetchall(
        "SELECT id, source_type, source_id, body, embedding FROM memory_chunks ORDER BY id DESC LIMIT 200",
        settings=settings,
    )
    scored: list[tuple[float, dict]] = []
    for r in rows:
        emb = r.get("embedding") or []
        if not emb:
            continue
        scored.append((cosine(q, emb), r))
    scored.sort(key=lambda x: x[0], reverse=True)
    out = []
    for score, r in scored[:k]:
        out.append({k: r[k] for k in ("id", "source_type", "source_id", "body")} | {"score": score})
    return out


def add_feedback(kind: str, target_type: str, target_id: str, rating: int | None, note: str | None, *, settings: Settings | None = None) -> None:
    db.execute(
        """
        INSERT INTO feedback_events (kind, target_type, target_id, rating, note)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (kind, target_type, target_id, rating, note),
        settings=settings,
    )


def upsert_review(as_of: str, draft: str, payload: dict, *, settings: Settings | None = None) -> None:
    db.execute(
        """
        INSERT INTO daily_reviews (as_of, draft, payload, status)
        VALUES (%s, %s, %s::jsonb, 'draft')
        ON CONFLICT (as_of) DO UPDATE SET draft = EXCLUDED.draft, payload = EXCLUDED.payload
        """,
        (as_of, draft, db.dumps(payload)),
        settings=settings,
    )


def approve_review(as_of: str, approved: str, *, settings: Settings | None = None) -> None:
    db.execute(
        """
        UPDATE daily_reviews
        SET approved = %s, status = 'approved', approved_at = now()
        WHERE as_of = %s
        """,
        (approved, as_of),
        settings=settings,
    )
    remember("review", as_of, approved, settings=settings)


def get_review(as_of: str, *, settings: Settings | None = None) -> dict | None:
    return db.fetchone("SELECT * FROM daily_reviews WHERE as_of = %s", (as_of,), settings=settings)


def list_reviews(limit: int = 30, *, settings: Settings | None = None) -> list[dict]:
    return db.fetchall(
        "SELECT as_of, status, created_at, approved_at FROM daily_reviews ORDER BY as_of DESC LIMIT %s",
        (limit,),
        settings=settings,
    )


def save_brief(as_of: str, kind: str, payload: dict, *, settings: Settings | None = None) -> None:
    db.execute(
        """
        INSERT INTO session_briefs (as_of, kind, payload)
        VALUES (%s, %s, %s::jsonb)
        ON CONFLICT (as_of, kind) DO UPDATE SET payload = EXCLUDED.payload, created_at = now()
        """,
        (as_of, kind, db.dumps(payload)),
        settings=settings,
    )


def get_brief(as_of: str | None = None, kind: str | None = None, *, settings: Settings | None = None) -> dict | None:
    if as_of and kind:
        return db.fetchone(
            "SELECT * FROM session_briefs WHERE as_of = %s AND kind = %s",
            (as_of, kind),
            settings=settings,
        )
    return db.fetchone(
        "SELECT * FROM session_briefs ORDER BY created_at DESC LIMIT 1",
        settings=settings,
    )


def latest_gex(ticker: str = "SPY", *, settings: Settings | None = None) -> dict | None:
    return db.fetchone(
        "SELECT * FROM gex_snapshots WHERE ticker = %s ORDER BY ts DESC LIMIT 1",
        (ticker,),
        settings=settings,
    )


def latest_character(ticker: str = "SPY", *, settings: Settings | None = None) -> dict | None:
    return db.fetchone(
        "SELECT * FROM character_snapshots WHERE ticker = %s ORDER BY ts DESC LIMIT 1",
        (ticker,),
        settings=settings,
    )


def list_level_reactions(ticker: str = "SPY", *, settings: Settings | None = None) -> list[dict]:
    return db.fetchall(
        "SELECT * FROM level_reactions WHERE ticker = %s ORDER BY level_name",
        (ticker,),
        settings=settings,
    )


def list_notables(ticker: str = "SPY", limit: int = 20, *, settings: Settings | None = None) -> list[dict]:
    return db.fetchall(
        "SELECT * FROM option_prints WHERE ticker = %s AND notable ORDER BY ts DESC LIMIT %s",
        (ticker, limit),
        settings=settings,
    )


def latest_flow(ticker: str = "SPY", *, settings: Settings | None = None) -> dict | None:
    return db.fetchone(
        "SELECT * FROM flow_daily WHERE ticker = %s ORDER BY as_of DESC LIMIT 1",
        (ticker,),
        settings=settings,
    )


def list_flow(ticker: str = "SPY", limit: int = 20, *, settings: Settings | None = None) -> list[dict]:
    return db.fetchall(
        "SELECT * FROM flow_daily WHERE ticker = %s ORDER BY as_of DESC LIMIT %s",
        (ticker, limit),
        settings=settings,
    )


def insert_gex(ticker: str, snap: dict, *, settings: Settings | None = None) -> None:
    db.execute(
        """
        INSERT INTO gex_snapshots (ticker, ts, spot, net_gex, call_wall, put_wall, max_gex_strike, gamma_sign, by_strike)
        VALUES (%s, now(), %s, %s, %s, %s, %s, %s, %s::jsonb)
        """,
        (
            ticker,
            snap.get("spot"),
            snap.get("net_gex"),
            snap.get("call_wall"),
            snap.get("put_wall"),
            snap.get("max_gex_strike"),
            snap.get("gamma_sign"),
            db.dumps(snap.get("by_strike") or []),
        ),
        settings=settings,
    )


def insert_character(ticker: str, state: dict, *, settings: Settings | None = None) -> None:
    db.execute(
        """
        INSERT INTO character_snapshots
          (ticker, ts, label, trend_vs_balance, follow_vs_fade, vol_texture, flipped, prior_label, features, apply_strategies, avoid_strategies)
        VALUES (%s, now(), %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s)
        """,
        (
            ticker,
            state["label"],
            state.get("trend_vs_balance"),
            state.get("follow_vs_fade"),
            state.get("vol_texture"),
            state.get("flipped", False),
            state.get("prior_label"),
            db.dumps(state.get("features") or {}),
            state.get("apply_strategies") or [],
            state.get("avoid_strategies") or [],
        ),
        settings=settings,
    )


def upsert_level_reaction(
    ticker: str,
    level_name: str,
    character_label: str,
    outcome: str,
    *,
    settings: Settings | None = None,
) -> None:
    col = {"hold": "hold_n", "reject": "reject_n", "through": "through_n"}.get(outcome)
    if not col:
        return
    db.execute(
        f"""
        INSERT INTO level_reactions (ticker, level_name, character_label, n, {col})
        VALUES (%s, %s, %s, 1, 1)
        ON CONFLICT (ticker, level_name, character_label) DO UPDATE SET
          n = level_reactions.n + 1,
          {col} = level_reactions.{col} + 1,
          updated_at = now()
        """,
        (ticker, level_name, character_label),
        settings=settings,
    )


def insert_minutes(ticker: str, bars: list[dict], *, settings: Settings | None = None) -> None:
    for b in bars:
        db.execute(
            """
            INSERT INTO underlying_minutes (ticker, ts, o, h, l, c, v)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (ticker, ts) DO UPDATE SET o=EXCLUDED.o, h=EXCLUDED.h, l=EXCLUDED.l, c=EXCLUDED.c, v=EXCLUDED.v
            """,
            (ticker, b["ts"], b.get("o"), b.get("h"), b.get("l"), b.get("c"), b.get("v")),
            settings=settings,
        )


def recent_minutes(ticker: str, limit: int = 120, *, settings: Settings | None = None) -> list[dict]:
    rows = db.fetchall(
        "SELECT * FROM underlying_minutes WHERE ticker = %s ORDER BY ts DESC LIMIT %s",
        (ticker, limit),
        settings=settings,
    )
    return list(reversed(rows))


def insert_print(row: dict, *, settings: Settings | None = None) -> None:
    db.execute(
        """
        INSERT INTO option_prints (ticker, occ, ts, price, size, premium, notable)
        VALUES (%(ticker)s, %(occ)s, %(ts)s, %(price)s, %(size)s, %(premium)s, %(notable)s)
        ON CONFLICT (occ, ts) DO NOTHING
        """,
        row,
        settings=settings,
    )


def upsert_flow_daily(row: dict, *, settings: Settings | None = None) -> None:
    db.execute(
        """
        INSERT INTO flow_daily (
          ticker, as_of, stock_volume, rel_vol_20, ad_line, call_oi_change, put_oi_change,
          unusual_premium, put_call, note, extras
        ) VALUES (
          %(ticker)s, %(as_of)s, %(stock_volume)s, %(rel_vol_20)s, %(ad_line)s,
          %(call_oi_change)s, %(put_oi_change)s, %(unusual_premium)s, %(put_call)s, %(note)s, %(extras)s::jsonb
        )
        ON CONFLICT (ticker, as_of) DO UPDATE SET
          stock_volume = EXCLUDED.stock_volume,
          rel_vol_20 = EXCLUDED.rel_vol_20,
          ad_line = EXCLUDED.ad_line,
          call_oi_change = EXCLUDED.call_oi_change,
          put_oi_change = EXCLUDED.put_oi_change,
          unusual_premium = EXCLUDED.unusual_premium,
          put_call = EXCLUDED.put_call,
          note = EXCLUDED.note,
          extras = EXCLUDED.extras
        """,
        {**row, "extras": db.dumps(row.get("extras") or {})},
        settings=settings,
    )


def upsert_flow_weekly(row: dict, *, settings: Settings | None = None) -> None:
    db.execute(
        """
        INSERT INTO flow_weekly (ticker, week_of, stock_volume, ad_line, call_oi_change, put_oi_change, unusual_premium, note, extras)
        VALUES (%(ticker)s, %(week_of)s, %(stock_volume)s, %(ad_line)s, %(call_oi_change)s, %(put_oi_change)s, %(unusual_premium)s, %(note)s, %(extras)s::jsonb)
        ON CONFLICT (ticker, week_of) DO UPDATE SET
          stock_volume = EXCLUDED.stock_volume,
          ad_line = EXCLUDED.ad_line,
          call_oi_change = EXCLUDED.call_oi_change,
          put_oi_change = EXCLUDED.put_oi_change,
          unusual_premium = EXCLUDED.unusual_premium,
          note = EXCLUDED.note
        """,
        {**row, "extras": db.dumps(row.get("extras") or {})},
        settings=settings,
    )


def insert_session_feature(ticker: str, extras: dict, **fields: Any) -> None:
    db.execute(
        """
        INSERT INTO session_features (ticker, ts, vix, rel_vol, session_volume, range_vs_open15, clock, extras)
        VALUES (%s, now(), %s, %s, %s, %s, %s, %s::jsonb)
        """,
        (
            ticker,
            fields.get("vix"),
            fields.get("rel_vol"),
            fields.get("session_volume"),
            fields.get("range_vs_open15"),
            fields.get("clock"),
            db.dumps(extras),
        ),
    )


def gold_rows(*, settings: Settings | None = None) -> dict[str, list[dict]]:
    return {
        "reviews": db.fetchall(
            "SELECT * FROM daily_reviews WHERE status = 'approved'",
            settings=settings,
        ),
        "behaviors": db.fetchall(
            "SELECT * FROM behaviors WHERE status = 'promoted'",
            settings=settings,
        ),
        "feedback": db.fetchall("SELECT * FROM feedback_events", settings=settings),
        "playbook": list_playbook(settings=settings),
        "journal": list_journal(200, settings=settings),
    }
