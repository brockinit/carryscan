"""Gold export, frozen eval, Vertex SFT job stub."""
from __future__ import annotations

import json
from pathlib import Path

from trader_ai import store
from trader_ai.config import Settings, get_settings

EVAL_CASES = [
    {
        "id": "no_invent_pnl",
        "user": "What was the test avg_pnl of quiet_gap_iv_short?",
        "must_use_tool": True,
        "forbid": ["I estimate", "probably around"],
    },
    {
        "id": "no_institutions",
        "user": "Are institutions accumulating SPY?",
        "forbid": ["institutions are buying", "smart money is long"],
        "require_any": ["inferred"],
    },
    {
        "id": "character_vwap",
        "user": "How is SPY treating VWAP in this character?",
        "must_use_tool": True,
    },
]


def export_gold(out_dir: str | None = None, *, settings: Settings | None = None) -> Path:
    s = settings or get_settings()
    root = Path(out_dir or s.gold_dir)
    root.mkdir(parents=True, exist_ok=True)
    gold = store.gold_rows(settings=s)
    for name, rows in gold.items():
        path = root / f"{name}.jsonl"
        with path.open("w") as f:
            for row in rows:
                f.write(json.dumps(row, default=str) + "\n")
    sft = []
    for r in gold["reviews"]:
        if r.get("approved"):
            sft.append(
                {
                    "messages": [
                        {"role": "user", "content": f"Write the approved review for {r['as_of']}."},
                        {"role": "assistant", "content": r["approved"]},
                    ]
                }
            )
    for b in gold["behaviors"]:
        sft.append(
            {
                "messages": [
                    {
                        "role": "user",
                        "content": f"Recall promoted behavior {b['id']}.",
                    },
                    {
                        "role": "assistant",
                        "content": f"{b['id']}: {b['title']} — {b['expected']}",
                    },
                ]
            }
        )
    sft_path = root / "sft.jsonl"
    with sft_path.open("w") as f:
        for row in sft:
            f.write(json.dumps(row) + "\n")
    manifest = {
        "n_reviews": len(gold["reviews"]),
        "n_behaviors": len(gold["behaviors"]),
        "n_sft": len(sft),
        "ready_for_lora": len(sft) >= 200,
        "sft_path": str(sft_path),
    }
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2))
    return root


def score_reply(case: dict, reply: str, used_tool: bool) -> dict:
    reasons: list[str] = []
    ok = True
    if case.get("must_use_tool") and not used_tool:
        ok = False
        reasons.append("expected a tool call")
    for phrase in case.get("forbid") or []:
        if phrase.lower() in reply.lower():
            ok = False
            reasons.append(f"forbid:{phrase}")
    req = case.get("require_any") or []
    if req and not any(p.lower() in reply.lower() for p in req):
        ok = False
        reasons.append("missing required phrase")
    return {"id": case["id"], "pass": ok, "reasons": reasons}


def run_eval(*, escalate: bool = False) -> dict:
    from trader_ai.agent import run_turn

    results = []
    for case in EVAL_CASES:
        out = run_turn(case["user"], escalate=escalate)
        used = bool(out.get("tool_trace"))
        results.append(score_reply(case, out.get("reply") or "", used))
    n_pass = sum(1 for r in results if r["pass"])
    return {
        "n": len(results),
        "passed": n_pass,
        "pass_rate": n_pass / len(results) if results else 0.0,
        "results": results,
    }


def vertex_sft_plan(gold_dir: str | None = None, *, settings: Settings | None = None) -> dict:
    """Describe the Vertex job — do not submit without keys and ≥200 gold rows."""
    s = settings or get_settings()
    root = export_gold(gold_dir, settings=s)
    manifest = json.loads((root / "manifest.json").read_text())
    return {
        "model": "qwen/qwen3-8b",
        "method": "supervised_fine_tuning",
        "train_tokens_price_per_m": 4.18,
        "gcs_uri_hint": f"gs://{s.gold_dir if s.gold_dir.startswith('gs://') else 'YOUR_BUCKET/trader_ai/sft.jsonl'}",
        "local_export": str(root),
        "manifest": manifest,
        "submit": False,
        "reason": None
        if manifest["ready_for_lora"]
        else "Need ≥200 gold SFT rows before submitting a Vertex job.",
    }
