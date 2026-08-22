"""Overnight batch: seed specs + optional JSONL hypotheses → ledger + kill-rate report."""
from __future__ import annotations

import json
from pathlib import Path

from spy_lab.bq import Bq
from spy_lab.jobs.experiments import load_specs, run_and_persist, run_seed_batch
from spy_lab.specs.schema import ExperimentSpec


def load_hypotheses_jsonl(path: Path) -> list[ExperimentSpec]:
    specs: list[ExperimentSpec] = []
    if not path.exists():
        return specs
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        specs.append(ExperimentSpec.model_validate(json.loads(line)))
    return specs


def run_overnight(
    *,
    hypotheses_path: Path | None = None,
    bq: Bq | None = None,
    runnable_only: bool = False,
) -> dict:
    bq = bq or Bq()
    results = run_seed_batch(bq=bq, runnable_only=runnable_only)
    if hypotheses_path:
        extra = load_hypotheses_jsonl(hypotheses_path)
        if extra:
            from datetime import date

            start = min(date.fromisoformat(s.train_start) for s in extra)
            end = max(date.fromisoformat(s.test_end) for s in extra)
            panel = bq.fetch_panel(start, end)
            for s in extra:
                results.append(run_and_persist(s, panel, bq=bq))

    kills = sum(1 for r in results if r["verdict"] == "KILL")
    holds = sum(1 for r in results if r["verdict"] == "HOLD")
    blocked = sum(1 for r in results if r["verdict"] == "DATA_BLOCKED")
    scored = kills + holds
    n = len(results)
    report = {
        "n": n,
        "kills": kills,
        "holds": holds,
        "blocked": blocked,
        "kill_rate": (kills / scored) if scored else 0.0,
        "results": [
            {
                "id": r["experiment_id"],
                "verdict": r["verdict"],
                "test_avg_pnl": r["test_metric"],
                "n_trades": r["n_trades"],
                "kill_reason": r["kill_reason"],
            }
            for r in results
        ],
    }
    print(json.dumps(report, indent=2))
    return report
