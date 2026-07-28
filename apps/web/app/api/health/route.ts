import { NextResponse } from "next/server";
import { getPool, hasDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

const INTERVALS: Record<string, number> = {
  snapshot: 60,
  funding: 3600,
  candles: 3600,
  closes: 86400,
  earnings_refresh: 7 * 86400,
  nightly: 86400,
};

export async function GET() {
  if (!hasDatabase()) {
    return NextResponse.json({
      ok: true,
      mode: "live",
      jobs: {},
      note: "No DATABASE_URL — serving live Hyperliquid data",
    });
  }

  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT job, last_ok FROM ingest_heartbeat`,
    );
    const jobs: Record<string, string> = {};
    let ok = true;
    const now = Date.now();
    for (const r of rows) {
      jobs[r.job] = new Date(r.last_ok).toISOString();
      const interval = INTERVALS[r.job] ?? 3600;
      if (now - new Date(r.last_ok).getTime() > interval * 3 * 1000) {
        ok = false;
      }
    }
    for (const core of ["snapshot", "funding", "nightly"]) {
      if (!jobs[core]) ok = false;
    }
    return NextResponse.json({ ok, mode: "db", jobs });
  } catch (err) {
    return NextResponse.json({
      ok: true,
      mode: "live",
      jobs: {},
      note: `DB unreachable — live fallback (${String(err)})`,
    });
  }
}
