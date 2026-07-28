import { NextResponse } from "next/server";
import { getPool, hasDatabase } from "@/lib/db";
import { feeDrag, netCarry } from "@/lib/carry";
import { liveMarketsPayload } from "@/lib/live";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function fromDb() {
  const pool = getPool();
  const { rows: markets } = await pool.query(`
      SELECT
        m.coin, m.cash_ticker AS ticker, m.name, m.ref_type,
        ml.as_of, ml.mark, ml.basis_pct,
        ml.apr_now, ml.apr_1d, ml.apr_7d, ml.apr_30d,
        ml.oi_usd, ml.spark
      FROM markets m
      LEFT JOIN market_metrics_live ml ON ml.market_id = m.id
      WHERE m.active
      ORDER BY m.id
    `);

  const asOfDates = markets
    .map((m) => m.as_of)
    .filter(Boolean)
    .map((d) => new Date(d).getTime());
  const maxAsOf = asOfDates.length ? Math.max(...asOfDates) : null;
  const stale = maxAsOf == null || Date.now() - maxAsOf > 5 * 60 * 1000;

  const defaults = { borrow_pct: 5.5, fees_rt_bps: 10, horizon: "7d" as const };
  const fee = feeDrag(defaults.fees_rt_bps, 30);

  const mapped = markets.map((m) => ({
    coin: m.coin as string,
    ticker: (m.ticker as string) || String(m.coin).split(":")[1],
    name: m.name as string,
    ref_type: m.ref_type as "stock" | "etf_proxy" | "none",
    mark: Number(m.mark ?? 0),
    basis_pct: m.basis_pct == null ? null : Number(m.basis_pct),
    apr_now: Number(m.apr_now ?? 0),
    apr_1d: Number(m.apr_1d ?? 0),
    apr_7d: Number(m.apr_7d ?? 0),
    apr_30d: Number(m.apr_30d ?? 0),
    oi_usd: Number(m.oi_usd ?? 0),
    spark: Array.isArray(m.spark) ? (m.spark as number[]) : [],
  }));

  const { rows: premRows } = await pool.query(`
      SELECT m.id, ml.oi_usd,
        (
          SELECT avg(apr) FROM heatmap_cells h
          WHERE h.market_id = m.id AND h.dow >= 5
        ) - (
          SELECT avg(apr) FROM heatmap_cells h
          WHERE h.market_id = m.id AND h.dow < 5
        ) AS weekend_premium
      FROM markets m
      LEFT JOIN market_metrics_live ml ON ml.market_id = m.id
      WHERE m.active
    `);

  let wSum = 0;
  let oiSum = 0;
  for (const r of premRows) {
    const oi = Number(r.oi_usd ?? 0);
    const wp = r.weekend_premium == null ? null : Number(r.weekend_premium);
    if (wp == null || !oi) continue;
    wSum += wp * oi;
    oiSum += oi;
  }
  const weekendPremium = oiSum > 0 ? wSum / oiSum : 0;

  const nets = mapped.map((m) => ({
    coin: m.coin,
    net: netCarry(m.apr_7d, defaults.borrow_pct, defaults.fees_rt_bps, 30),
  }));
  nets.sort((a, b) => b.net - a.net);
  const richest = nets[0]
    ? { coin: nets[0].coin, net_carry: nets[0].net }
    : null;

  return {
    as_of: maxAsOf ? new Date(maxAsOf).toISOString() : null,
    stale,
    live_mode: false,
    defaults,
    summary: {
      richest,
      median_apr_7d: median(mapped.map((m) => m.apr_7d)),
      weekend_premium_pts: weekendPremium,
      total_oi_usd: mapped.reduce((s, m) => s + m.oi_usd, 0),
    },
    markets: mapped,
    _fee_drag_pts: fee,
  };
}

export async function GET() {
  try {
    if (hasDatabase()) {
      try {
        return NextResponse.json(await fromDb());
      } catch (err) {
        console.warn("DB markets failed, falling back to live HL", err);
      }
    }
    return NextResponse.json(await liveMarketsPayload());
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Data feed unreachable", detail: String(err) },
      { status: 503 },
    );
  }
}
