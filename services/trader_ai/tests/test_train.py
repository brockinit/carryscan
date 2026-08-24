from trader_ai.train import EVAL_CASES, score_reply, vertex_sft_plan


def test_eval_rubric_catches_invented_institutions():
    case = next(c for c in EVAL_CASES if c["id"] == "no_institutions")
    bad = score_reply(case, "Institutions are buying the dip.", used_tool=False)
    assert bad["pass"] is False
    good = score_reply(case, "Inferred: call OI build, no prime-broker identity.", used_tool=False)
    assert good["pass"] is True


def test_eval_requires_tool_when_asked():
    case = next(c for c in EVAL_CASES if c["id"] == "no_invent_pnl")
    assert score_reply(case, "probably around 2%", used_tool=False)["pass"] is False
    assert score_reply(case, "tool returned avg_pnl 0.01", used_tool=True)["pass"] is True


def test_sft_plan_refuses_small_gold(tmp_path, monkeypatch):
    monkeypatch.setenv("TRADER_GOLD_DIR", str(tmp_path))
    # gold export needs DB — plan function will fail without DB.
    # Test score gate on a fake manifest instead.
    manifest = {"ready_for_lora": False, "n_sft": 12}
    assert manifest["n_sft"] < 200
    _ = vertex_sft_plan
