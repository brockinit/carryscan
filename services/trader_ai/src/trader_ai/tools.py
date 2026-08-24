"""Copilot tools. Numbers come from code / spy_lab only."""
from __future__ import annotations

import json
from datetime import date
from typing import Any, Callable

from trader_ai import store
from trader_ai.character import reaction_rates

TOOL_SCHEMAS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "run_backtest",
            "description": "Validate an ExperimentSpec and run spy_lab walk-forward. Do not invent PnL.",
            "parameters": {
                "type": "object",
                "properties": {"spec": {"type": "object"}},
                "required": ["spec"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_ledger",
            "description": "List recent experiment_ledger rows from BigQuery.",
            "parameters": {"type": "object", "properties": {"limit": {"type": "integer"}}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_tape",
            "description": "Latest GEX, character, notables, flow for a ticker.",
            "parameters": {
                "type": "object",
                "properties": {"ticker": {"type": "string"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_character",
            "description": "Character state and level reaction book.",
            "parameters": {
                "type": "object",
                "properties": {"ticker": {"type": "string"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_journal",
            "description": "Retrieve similar journal / playbook / behavior chunks.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_behaviors",
            "description": "List taught behaviors, optionally by status.",
            "parameters": {
                "type": "object",
                "properties": {"status": {"type": "string"}},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "propose_behavior",
            "description": "Draft a behavior from a lesson. Status starts as draft.",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "title": {"type": "string"},
                    "expected": {"type": "string"},
                    "trigger": {"type": "object"},
                },
                "required": ["id", "title", "expected"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_brief",
            "description": "Latest session brief payload.",
            "parameters": {
                "type": "object",
                "properties": {
                    "kind": {"type": "string"},
                    "as_of": {"type": "string"},
                },
            },
        },
    },
]


def run_backtest(spec: dict, **_kw: Any) -> dict:
    from spy_lab.jobs.experiments import run_and_persist
    from spy_lab.specs.schema import ExperimentSpec

    parsed = ExperimentSpec.model_validate(spec)
    try:
        from spy_lab.bq import Bq

        start = date.fromisoformat(parsed.train_start)
        end = date.fromisoformat(parsed.test_end)
        panel = Bq().fetch_panel(start, end)
        return run_and_persist(parsed, panel)
    except Exception as e:
        from spy_lab.backtest.run_spec import run_spec

        result = run_spec(parsed, [])
        result["persist_error"] = str(e)
        return result


def query_ledger(limit: int = 20, **_kw: Any) -> dict:
    try:
        from spy_lab.bq import Bq
        from spy_lab.config import get_settings

        s = get_settings()
        rows = Bq(s).query(
            f"SELECT * FROM `{s.table}.experiment_ledger` ORDER BY id LIMIT {int(limit)}"
        )
        return {"rows": rows}
    except Exception as e:
        return {"rows": [], "error": str(e)}


def get_tape(ticker: str = "SPY", **_kw: Any) -> dict:
    try:
        gex = store.latest_gex(ticker)
        character = store.latest_character(ticker)
        notables = store.list_notables(ticker)
        flow = store.latest_flow(ticker)
        offline = False
    except Exception as e:
        gex = character = flow = None
        notables = []
        offline = True
        _ = e
    return {
        "ticker": ticker,
        "gex": gex,
        "character": character,
        "notables": notables,
        "flow": flow,
        "inferred": True,
        "offline": offline,
    }


def get_character(ticker: str = "SPY", **_kw: Any) -> dict:
    state = store.latest_character(ticker)
    levels = store.list_level_reactions(ticker)
    book = []
    for lv in levels:
        book.append(
            {
                **lv,
                "rates": reaction_rates(lv["hold_n"], lv["reject_n"], lv["through_n"]),
            }
        )
    return {"character": state, "level_reactions": book}


def search_journal(query: str, **_kw: Any) -> dict:
    return {"chunks": store.search_memory(query)}


def list_behaviors_tool(status: str | None = None, **_kw: Any) -> dict:
    return {"behaviors": store.list_behaviors(status)}


def propose_behavior(
    id: str,
    title: str,
    expected: str,
    trigger: dict | None = None,
    **_kw: Any,
) -> dict:
    store.upsert_behavior(
        {
            "id": id,
            "title": title,
            "expected": expected,
            "trigger": trigger or {},
            "status": "draft",
        }
    )
    return {"ok": True, "id": id, "status": "draft"}


def get_brief_tool(kind: str | None = None, as_of: str | None = None, **_kw: Any) -> dict:
    row = store.get_brief(as_of, kind)
    return {"brief": row}


HANDLERS: dict[str, Callable[..., dict]] = {
    "run_backtest": run_backtest,
    "query_ledger": query_ledger,
    "get_tape": get_tape,
    "get_character": get_character,
    "search_journal": search_journal,
    "list_behaviors": list_behaviors_tool,
    "propose_behavior": propose_behavior,
    "get_brief": get_brief_tool,
}


def dispatch(name: str, arguments: str | dict) -> dict:
    args = json.loads(arguments) if isinstance(arguments, str) else (arguments or {})
    fn = HANDLERS.get(name)
    if not fn:
        return {"error": f"unknown tool {name}"}
    try:
        return fn(**args)
    except Exception as e:
        return {"error": str(e)}
