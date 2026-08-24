"""Model router: Vertex MaaS by default, optional Grok/Opus, stub when unset."""
from __future__ import annotations

from typing import Any, Literal

import httpx

from trader_ai.config import Settings, get_settings

Role = Literal["system", "user", "assistant", "tool"]


class ChatMessage(dict):
    pass


def _openai_chat(
    *,
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict],
    tools: list[dict] | None = None,
    extra: dict | None = None,
) -> dict:
    payload: dict[str, Any] = {"model": model, "messages": messages}
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
    if extra:
        payload.update(extra)
    r = httpx.post(
        f"{base_url.rstrip('/')}/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=120.0,
    )
    r.raise_for_status()
    return r.json()


def _anthropic_chat(
    *,
    api_key: str,
    model: str,
    messages: list[dict],
    system: str,
) -> dict:
    r = httpx.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "max_tokens": 2048,
            "system": system,
            "messages": [m for m in messages if m.get("role") != "system"],
        },
        timeout=120.0,
    )
    r.raise_for_status()
    data = r.json()
    text = "".join(
        b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"
    )
    return {
        "choices": [{"message": {"role": "assistant", "content": text, "tool_calls": None}}]
    }


def stub_chat(messages: list[dict], tools: list[dict] | None = None) -> dict:
    last = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
    text = (
        "Stub model (no VERTEX/GROK/ANTHROPIC key). "
        "Use tools for numbers. Last ask: "
        + str(last)[:400]
    )
    tool_calls = None
    if tools and any(t["function"]["name"] == "get_tape" for t in tools):
        if "vwap" in str(last).lower() or "gex" in str(last).lower() or "tape" in str(last).lower():
            tool_calls = [
                {
                    "id": "stub_tape",
                    "type": "function",
                    "function": {"name": "get_tape", "arguments": '{"ticker":"SPY"}'},
                }
            ]
    return {
        "choices": [
            {
                "message": {
                    "role": "assistant",
                    "content": None if tool_calls else text,
                    "tool_calls": tool_calls,
                }
            }
        ],
        "stub": True,
    }


def complete(
    messages: list[dict],
    *,
    tools: list[dict] | None = None,
    escalate: bool = False,
    settings: Settings | None = None,
) -> dict:
    s = settings or get_settings()
    if escalate and s.anthropic_api_key:
        system = next((m["content"] for m in messages if m.get("role") == "system"), "")
        return _anthropic_chat(
            api_key=s.anthropic_api_key,
            model=s.anthropic_model,
            messages=messages,
            system=system,
        )
    if escalate and s.grok_api_key:
        return _openai_chat(
            base_url=s.grok_base_url,
            api_key=s.grok_api_key,
            model=s.grok_model,
            messages=messages,
            tools=tools,
        )
    if s.vertex_api_key and s.vertex_base_url:
        return _openai_chat(
            base_url=s.vertex_base_url,
            api_key=s.vertex_api_key,
            model=s.vertex_model,
            messages=messages,
            tools=tools,
        )
    return stub_chat(messages, tools)
