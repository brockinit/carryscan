# trader_ai

Trading copilot runtime: tape context, session briefs, journal/behaviors, spy_lab tools.

```bash
cd services/trader_ai
python -m venv .venv && source .venv/bin/activate
pip install -e ../spy_lab -e ".[dev]"
pytest
trader-ai serve   # :8080
```

Jobs: `trader-ai tape --force`, `preopen`, `postclose`, `flow-daily`, `export-gold`, `eval`, `sft-plan`.

Cloud Run: build from repo root with this Dockerfile (`cloudrun.yaml`). Tape worker is the same image with `trader-ai tape --force` on a 90s Cloud Scheduler during RTH, or a command override running a loop. Pre-open / post-close: `trader-ai preopen` at 8:30 ET and `trader-ai postclose` at 16:15 ET. Apply `db/migrations/002_trader_ai.sql` via `make migrate`.
