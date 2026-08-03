#!/usr/bin/env bash
# Sunday weekly scorecard → apps/web/content/weekly/YYYY-MM-DD.json
# Cursor Automation / cron: run from repo root, then commit + push main.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/services/ingest"
export PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://carryscan.vercel.app}"
npm run weekly
cd "$ROOT"
FILE=$(ls -1t apps/web/content/weekly/*.json | head -1)
git add "$FILE"
if git diff --cached --quiet; then
  echo "no weekly changes"
  exit 0
fi
git commit -m "chore(weekly): publish $(basename "$FILE" .json) scorecard"
git push origin HEAD:main
echo "published $FILE"
