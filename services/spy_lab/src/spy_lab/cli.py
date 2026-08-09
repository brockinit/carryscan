"""spy-lab CLI."""
from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

from spy_lab.config import PKG_ROOT, get_settings


def _d(s: str) -> date:
    return date.fromisoformat(s)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="spy-lab", description="SPY Edge Factory")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init-bq", help="Apply BigQuery DDL")

    e = sub.add_parser("backfill-events", help="Computed + FMP market_events")
    e.add_argument("--start", type=_d, required=True)
    e.add_argument("--end", type=_d, required=True)
    e.add_argument("--no-fmp", action="store_true")

    u = sub.add_parser("backfill-underlying", help="SPY bars (Massive → FMP fallback)")
    u.add_argument("--start", type=_d, required=True)
    u.add_argument("--end", type=_d, required=True)

    s = sub.add_parser("backfill-surfaces", help="GCS option_day_aggs → surfaces")
    s.add_argument("--start", type=_d, required=True)
    s.add_argument("--end", type=_d, required=True)
    s.add_argument("--no-skip", action="store_true")

    n = sub.add_parser("nightly", help="Underlying + FMP events + REST snapshot")
    n.add_argument("--as-of", type=_d, default=None)

    r = sub.add_parser("run-spec", help="Run seed experiment specs")
    r.add_argument("--spec", type=Path, default=None, help="Single JSON file")

    o = sub.add_parser("overnight", help="Seed + optional hypotheses JSONL")
    o.add_argument("--hypotheses", type=Path, default=None)

    args = p.parse_args(argv)
    settings = get_settings()

    if args.cmd == "init-bq":
        from spy_lab.bq import Bq

        ddl = PKG_ROOT / "sql" / "ddl.sql"
        print(f"Applying {ddl} → {settings.table}")
        Bq(settings).apply_ddl_file(str(ddl))
        print("ok")
        return

    if args.cmd == "backfill-events":
        from spy_lab.jobs.events import run_backfill_events

        n = run_backfill_events(args.start, args.end, use_fmp=not args.no_fmp)
        print(f"events merged: {n}")
        return

    if args.cmd == "backfill-underlying":
        from spy_lab.jobs.underlying import run_backfill_underlying

        n = run_backfill_underlying(args.start, args.end)
        print(f"underlying rows: {n}")
        return

    if args.cmd == "backfill-surfaces":
        from spy_lab.jobs.surfaces import run_backfill_surfaces

        n = run_backfill_surfaces(args.start, args.end, skip_done=not args.no_skip)
        print(f"surface days: {n}")
        return

    if args.cmd == "nightly":
        from spy_lab.jobs.surfaces import run_nightly_snapshot

        n = run_nightly_snapshot(args.as_of)
        print(f"nightly surfaces: {n}")
        return

    if args.cmd == "run-spec":
        from spy_lab.jobs.experiments import load_specs, run_and_persist, run_seed_batch
        from spy_lab.bq import Bq
        from spy_lab.specs.schema import ExperimentSpec
        import json

        if args.spec:
            data = json.loads(args.spec.read_text())
            spec = ExperimentSpec.model_validate(data)
            bq = Bq()
            panel = bq.fetch_panel(
                date.fromisoformat(spec.train_start),
                date.fromisoformat(spec.test_end),
            )
            print(json.dumps(run_and_persist(spec, panel, bq=bq), indent=2, default=str))
        else:
            import json as _json

            print(_json.dumps(run_seed_batch(), indent=2, default=str))
        return

    if args.cmd == "overnight":
        from spy_lab.agent.overnight import run_overnight

        run_overnight(hypotheses_path=args.hypotheses)
        return


if __name__ == "__main__":
    main()
