"""Load seed specs, run backtests, write ledger."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from spy_lab.backtest.run_spec import run_spec
from spy_lab.bq import Bq
from spy_lab.config import PKG_ROOT
from spy_lab.specs.schema import ExperimentSpec

SEEDS_DIR = PKG_ROOT / "seeds"


def load_specs(path: Path | None = None) -> list[ExperimentSpec]:
    root = path or SEEDS_DIR
    specs: list[ExperimentSpec] = []
    if not root.exists():
        return specs
    for p in sorted(root.glob("*.json")):
        data = json.loads(p.read_text())
        if isinstance(data, list):
            specs.extend(ExperimentSpec.model_validate(x) for x in data)
        else:
            specs.append(ExperimentSpec.model_validate(data))
    return specs


def run_and_persist(spec: ExperimentSpec, panel: list[dict], bq: Bq | None = None) -> dict:
    bq = bq or Bq()
    result = run_spec(spec, panel)
    bq.insert_run(
        {
            "run_id": result["run_id"],
            "experiment_id": result["experiment_id"],
            "spec_hash": result["spec_hash"],
            "train_start": spec.train_start,
            "train_end": spec.train_end,
            "test_start": spec.test_start,
            "test_end": spec.test_end,
            "metrics_json": {
                "train": result["train"],
                "test": result["test"],
                "kill_reason": result["kill_reason"],
            },
            "verdict": result["verdict"],
        }
    )
    bq.upsert_ledger(
        {
            "id": spec.id,
            "title": spec.title,
            "spec_json": result["spec"],
            "verdict": result["verdict"],
            "primary_metric": result["primary_metric"],
            "n_trades": result["n_trades"],
            "train_metric": result["train_metric"],
            "test_metric": result["test_metric"],
            "kill_reason": result["kill_reason"] or "",
        }
    )
    return result


def run_seed_batch(bq: Bq | None = None) -> list[dict]:
    bq = bq or Bq()
    specs = load_specs()
    if not specs:
        return []
    start = min(date.fromisoformat(s.train_start) for s in specs)
    end = max(date.fromisoformat(s.test_end) for s in specs)
    panel = bq.fetch_panel(start, end)
    return [run_and_persist(s, panel, bq=bq) for s in specs]
