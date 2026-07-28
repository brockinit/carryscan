import { NextRequest, NextResponse } from "next/server";
import { getPool, hasDatabase } from "@/lib/db";
import { liveMarketDetail } from "@/lib/live";
import { SEED_MARKETS } from "@/lib/hl";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function decodeCoin(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function fromDb(coin: string) {
  const pool = getPool();
  const { rows } = await pool.query(
    `
      SELECT m.id, m.coin, m.cash_ticker AS ticker, m.name, m.ref_type,
             ml.as_of, ml.mark, ml.basis_pct,
             ml.apr_now, ml.apr_1d, ml.apr_7d, ml.apr_30d, ml.oi_usd
      FROM markets m
      LEFT JOIN market_metrics_live ml ON ml.market_id = m.id
      WHERE m.coin = $1
      `,
    [coin],
  );

  if (!rows.length) {
    const known = await pool.query(
      `SELECT coin FROM markets WHERE active ORDER BY coin`,
    );
    return {
      status: 404 as const,
      body: {
        error: "unknown market",
        known: known.rows.map((r) => r.coin),
      },
    };
  }

  const m = rows[0];
  const marketId = m.id as number;

  const { rows: heatRows } = await pool.query(
    `SELECT dow, hour, apr FROM heatmap_cells WHERE market_id = $1`,
    [marketId],
  );
  const cells: number[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0),
  );
  for (const r of heatRows) {
    cells[r.dow][r.hour] = Number(r.apr);
  }
  let week = 0,
    weekN = 0,
    wend = 0,
    wendN = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (d >= 5) {
        wend += cells[d][h];
        wendN++;
      } else {
        week += cells[d][h];
        weekN++;
      }
    }
  }
  const weekendPremium =
    (wendN ? wend / wendN : 0) - (weekN ? week / weekN : 0);

  const { rows: ticks } = await pool.query(
    `
      SELECT ts, rate FROM funding_ticks
      WHERE market_id = $1 AND ts >= now() - interval '35 days'
      ORDER BY ts
      `,
    [marketId],
  );

  const byDay = new Map<string, number[]>();
  for (const t of ticks) {
    const et = new Date(t.ts);
    const key = et.toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(Number(t.rate));
  }

  const endKey =
    Array.from(byDay.keys()).sort().at(-1) ||
    new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const end = new Date(endKey + "T12:00:00Z");
  const daily: number[] = [];
  const weekendIdx: number[][] = [];
  let startStr = "";
  for (let i = 29; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (i === 29) startStr = key;
    const rates = byDay.get(key) || [];
    const mean = rates.length
      ? rates.reduce((a, b) => a + b, 0) / rates.length
      : 0;
    daily.push(mean * 24 * 365 * 100);
    const dow = d.getUTCDay();
    if (dow === 6 && i > 0) {
      const idx = 29 - i;
      weekendIdx.push([idx, idx + 1]);
    }
  }

  const { rows: gaps } = await pool.query(
    `
      SELECT weekend_start, perp_drift, cash_gap, short_mae, funding_banked
      FROM weekend_gaps
      WHERE market_id = $1
      ORDER BY weekend_start DESC
      LIMIT 8
      `,
    [marketId],
  );

  const { rows: wins } = await pool.query(
    `
      SELECT print_date, window_avg, delta_vs_baseline, peak_basis
      FROM earnings_windows
      WHERE market_id = $1
      ORDER BY print_date DESC
      LIMIT 8
      `,
    [marketId],
  );

  let nextEarn = null;
  if (m.ticker) {
    const { rows: nextRows } = await pool.query(
      `
        SELECT print_date, session FROM earnings
        WHERE ticker = $1 AND print_date >= CURRENT_DATE
        ORDER BY print_date ASC LIMIT 1
        `,
      [m.ticker],
    );
    if (nextRows.length) {
      nextEarn = {
        print_date: String(nextRows[0].print_date).slice(0, 10),
        session: nextRows[0].session as string,
        estimated: true,
      };
    }
  }

  return {
    status: 200 as const,
    body: {
      coin: m.coin,
      ticker: m.ticker || String(m.coin).split(":")[1],
      name: m.name,
      ref_type: m.ref_type,
      as_of: m.as_of ? new Date(m.as_of).toISOString() : null,
      live_mode: false,
      live: {
        mark: Number(m.mark ?? 0),
        basis_pct: m.basis_pct == null ? null : Number(m.basis_pct),
        apr_now: Number(m.apr_now ?? 0),
        apr_1d: Number(m.apr_1d ?? 0),
        apr_7d: Number(m.apr_7d ?? 0),
        apr_30d: Number(m.apr_30d ?? 0),
        oi_usd: Number(m.oi_usd ?? 0),
      },
      heatmap: { tz: "America/New_York", days: DAYS, cells },
      weekend_premium_pts: weekendPremium,
      history_30d: {
        start: startStr,
        daily_apr: daily,
        weekend_idx: weekendIdx,
      },
      weekend_gaps: gaps.map((g) => ({
        weekend_start: String(g.weekend_start).slice(0, 10),
        perp_drift: Number(g.perp_drift),
        cash_gap: Number(g.cash_gap),
        short_mae: Number(g.short_mae),
        funding_banked: Number(g.funding_banked),
      })),
      earnings: {
        next: nextEarn,
        windows: wins.map((w) => ({
          print_date: String(w.print_date).slice(0, 10),
          window_avg: Number(w.window_avg),
          delta_vs_baseline: Number(w.delta_vs_baseline),
          peak_basis: Number(w.peak_basis),
        })),
      },
    },
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { coin: string } },
) {
  const coin = decodeCoin(params.coin);
  try {
    if (hasDatabase()) {
      try {
        const result = await fromDb(coin);
        return NextResponse.json(result.body, { status: result.status });
      } catch (err) {
        console.warn("DB detail failed, falling back to live HL", err);
      }
    }
    const live = await liveMarketDetail(coin);
    if ("error" in live) {
      return NextResponse.json(
        {
          error: live.error,
          known: live.known?.length
            ? live.known
            : SEED_MARKETS.map((m) => m.coin),
        },
        { status: 404 },
      );
    }
    return NextResponse.json(live);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Data feed unreachable", detail: String(err) },
      { status: 503 },
    );
  }
}
