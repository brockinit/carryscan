"""Tool-calling copilot. Never invent tape / backtest numbers."""
from __future__ import annotations

import json

from trader_ai.router import complete
from trader_ai.tools import TOOL_SCHEMAS, dispatch

SYSTEM = """You are a specialist trading copilot for this desk (SPY/SPX options and related names).

Hard rules:
- Do not invent GEX, walls, volume, flow, character rates, or backtest PnL.
- Call tools for those numbers. If a tool errors or returns empty, say so.
- Flow is inferred (OI change, A/D, unusual premium) — never say "institutions are buying".
- Structure targets are magnets, not forecasts.
- Cite behavior ids and playbook ids when they apply.
- Prefer kill over promote on new hypotheses.
- No alerts or paging language.
"""


def run_turn(user_text: str, *, escalate: bool = False, history: list[dict] | None = None) -> dict:
    messages: list[dict] = [{"role": "system", "content": SYSTEM}]
    if history:
        messages.extend(history[-12:])
    messages.append({"role": "user", "content": user_text})
    traces: list[dict] = []
    for _ in range(6):
        raw = complete(messages, tools=TOOL_SCHEMAS, escalate=escalate)
        msg = raw["choices"][0]["message"]
        tool_calls = msg.get("tool_calls") or []
        if not tool_calls:
            return {
                "reply": msg.get("content") or "",
                "tool_trace": traces,
                "stub": bool(raw.get("stub")),
            }
        messages.append(msg)
        for tc in tool_calls:
            name = tc["function"]["name"]
            args = tc["function"].get("arguments") or "{}"
            result = dispatch(name, args)
            traces.append({"tool": name, "args": args, "result": result})
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tc.get("id", name),
                    "content": json.dumps(result, default=str)[:12000],
                }
            )
    return {
        "reply": "Stopped after tool-call limit. Ask again with a narrower question.",
        "tool_trace": traces,
        "stub": True,
    }
