from trader_ai.agent import run_turn
from trader_ai.tools import dispatch


def test_unknown_tool():
    assert "error" in dispatch("nope", {})


def test_stub_chat_turn():
    out = run_turn("Say hello without tools.")
    assert out["reply"]
    assert out.get("stub") is True
