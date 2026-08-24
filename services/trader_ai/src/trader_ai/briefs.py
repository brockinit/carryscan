"""Pre-open and post-close session packets. Structure first, then a short narrative."""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from trader_ai import store
from trader_ai.agent import run_turn
from trader_ai.character import reaction_rates
from trader_ai.config import Settings, get_settings

ET = ZoneInfo("America/New_York")


def _as_of() -> str:
    return datetime.now(ET).date().isoformat()


def _matching_behaviors(payload: dict) -> list[dict]:
    promoted = store.list_behaviors("promoted")
    hits = []
    gex = payload.get("gex") or {}
    char = (payload.get("character") or {}).get("label")
    for b in promoted:
        trig = b.get("trigger") or {}
        if isinstance(trig, str):
            continue
        ok = True
        if "character" in trig and char and trig["character"] != char:
            ok = False
        if trig.get("gamma_sign") and gex.get("gamma_sign") != trig["gamma_sign"]:
            ok = False
        if ok:
            hits.append({"id": b["id"], "title": b["title"], "expected": b["expected"]})
    return hits[:8]


def build_preopen_packet(ticker: str = "SPY") -> dict:
    gex = store.latest_gex(ticker) or {}
    character = store.latest_character(ticker) or {}
    levels = store.list_level_reactions(ticker)
    flow = store.latest_flow(ticker)
    book = [
        {
            "level": lv["level_name"],
            "character": lv["character_label"],
            **reaction_rates(lv["hold_n"], lv["reject_n"], lv["through_n"]),
        }
        for lv in levels
    ]
    magnets = {
        "call_wall": gex.get("call_wall"),
        "put_wall": gex.get("put_wall"),
        "max_gex_strike": gex.get("max_gex_strike"),
        "note": "structure magnets, not forecasts",
    }
    packet = {
        "kind": "preopen",
        "as_of": _as_of(),
        "ticker": ticker,
        "character": {
            "label": character.get("label"),
            "apply": character.get("apply_strategies") or [],
            "avoid": character.get("avoid_strategies") or [],
            "flipped": character.get("flipped"),
        },
        "gex": {
            "net_gex": gex.get("net_gex"),
            "gamma_sign": gex.get("gamma_sign"),
            "spot": gex.get("spot"),
            **magnets,
        },
        "level_reactions": book,
        "flow": flow,
        "inferred_flow": True,
    }
    packet["matching_behaviors"] = _matching_behaviors(packet)
    packet["candidate_trades"] = [
        {
            "from": "behavior",
            "id": b["id"],
            "note": b["expected"],
        }
        for b in packet["matching_behaviors"][:3]
    ]
    return packet


def build_postclose_packet(ticker: str = "SPY") -> dict:
    pre = store.get_brief(_as_of(), "preopen")
    journal = store.list_journal(20)
    trades = store.list_trades(20)
    character = store.latest_character(ticker) or {}
    return {
        "kind": "postclose",
        "as_of": _as_of(),
        "ticker": ticker,
        "character": {
            "label": character.get("label"),
            "flipped": character.get("flipped"),
        },
        "preopen": (pre or {}).get("payload") if pre else None,
        "journal_today": [j for j in journal if str(j.get("as_of")) == _as_of()],
        "trades": trades[:10],
        "matching_behaviors": _matching_behaviors({"character": character, "gex": store.latest_gex(ticker) or {}}),
    }


def narrate(packet: dict, *, escalate: bool = False) -> str:
    prompt = (
        "Write a tight session brief from this JSON only. "
        "Cite behavior ids. Do not add numbers that are not in the packet.\n\n"
        + str(packet)
    )
    out = run_turn(prompt, escalate=escalate)
    return out.get("reply") or ""


def run_preopen(ticker: str = "SPY", settings: Settings | None = None) -> dict:
    packet = build_preopen_packet(ticker)
    try:
        packet["narrative"] = narrate(packet)
    except Exception as e:
        packet["narrative"] = ""
        packet["narrative_error"] = str(e)
    store.save_brief(packet["as_of"], "preopen", packet, settings=settings)
    return packet


def run_postclose(ticker: str = "SPY", settings: Settings | None = None) -> dict:
    packet = build_postclose_packet(ticker)
    try:
        packet["narrative"] = narrate(packet)
    except Exception as e:
        packet["narrative"] = ""
        packet["narrative_error"] = str(e)
    store.save_brief(packet["as_of"], "postclose", packet, settings=settings)
    draft = packet.get("narrative") or "Post-close draft — edit on /review."
    store.upsert_review(packet["as_of"], draft, packet, settings=settings)
    return packet
