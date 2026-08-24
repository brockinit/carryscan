"""trader-ai CLI."""
from __future__ import annotations

import argparse
import json


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="trader-ai")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("serve", help="Run FastAPI")
    t = sub.add_parser("tape", help="One tape tick")
    t.add_argument("--force", action="store_true")
    sub.add_parser("preopen")
    sub.add_parser("postclose")
    sub.add_parser("flow-daily")
    sub.add_parser("export-gold")
    sub.add_parser("eval")
    sub.add_parser("sft-plan")
    args = p.parse_args(argv)

    if args.cmd == "serve":
        import uvicorn

        uvicorn.run("trader_ai.server:app", host="0.0.0.0", port=8080)
        return
    if args.cmd == "tape":
        from trader_ai.tape import run_once

        print(json.dumps(run_once(force=args.force), default=str, indent=2))
        return
    if args.cmd == "preopen":
        from trader_ai.briefs import run_preopen

        print(json.dumps(run_preopen(), default=str, indent=2))
        return
    if args.cmd == "postclose":
        from trader_ai.briefs import run_postclose

        print(json.dumps(run_postclose(), default=str, indent=2))
        return
    if args.cmd == "flow-daily":
        from trader_ai.flow_jobs import run_daily

        print(json.dumps(run_daily(), default=str, indent=2))
        return
    if args.cmd == "export-gold":
        from trader_ai.train import export_gold

        print(export_gold())
        return
    if args.cmd == "eval":
        from trader_ai.train import run_eval

        print(json.dumps(run_eval(), default=str, indent=2))
        return
    if args.cmd == "sft-plan":
        from trader_ai.train import vertex_sft_plan

        print(json.dumps(vertex_sft_plan(), default=str, indent=2))
        return
