import { getPool, fundingRates, heartbeat, loadMarkets, type Market } from "../db.js";
import {
  addDaysYmd,
  apr,
  earningsWindowBounds,
  etDateKey,
  heatmapCells,
  weekendGap,
  weekendPremium,
  type Candle,
} from "../metrics/index.js";

async function rebuildHeatmap(marketId: number): Promise<number> {
  const since = new Date(Date.now() - 90 * 86400 * 1000);
  const ticks = await fundingRates(marketId, since);
  const matrix = heatmapCells(ticks);
  const pool = getPool();
  await pool.query(`DELETE FROM heatmap_cells WHERE market_id = $1`, [marketId]);
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      await pool.query(
        `INSERT INTO heatmap_cells (market_id, dow, hour, apr) VALUES ($1,$2,$3,$4)`,
        [marketId, d, h, matrix[d][h]],
      );
    }
  }
  return weekendPremium(matrix);
}

function fridaysBack(n = 26): string[] {
  // Walk ET calendar via noon UTC approximations
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
  let d = new Date(todayKey + "T12:00:00Z");
  while (d.getUTCDay() !== 5) {
    d = new Date(d.getTime() - 86400 * 1000);
  }
  const mon = new Date(d.getTime() + 3 * 86400 * 1000);
  if (mon.toISOString().slice(0, 10) >= todayKey) {
    d = new Date(d.getTime() - 7 * 86400 * 1000);
  }
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() - 7 * 86400 * 1000);
  }
  return out;
}

async function rebuildWeekendGaps(market: Market) {
  const pool = getPool();
  const { rows: candlesRaw } = await pool.query(
    `SELECT ts, o, h, l, c FROM candles_1h
     WHERE market_id = $1 AND ts >= now() - interval '200 days'
     ORDER BY ts`,
    [market.id],
  );
  const candles: Candle[] = candlesRaw.map((r) => [
    r.ts as Date,
    Number(r.o),
    Number(r.h),
    Number(r.l),
    Number(r.c),
  ]);
  const funding = await fundingRates(
    market.id,
    new Date(Date.now() - 200 * 86400 * 1000),
  );
  const ticker = market.cash_ticker;

  await pool.query(`DELETE FROM weekend_gaps WHERE market_id = $1`, [market.id]);
  for (const fri of fridaysBack(26)) {
    let friClose: number | null = null;
    let monOpen: number | null = null;
    if (ticker) {
      const a = await pool.query(
        `SELECT close FROM equity_closes WHERE ticker = $1 AND d = $2`,
        [ticker, fri],
      );
      friClose = a.rows[0] ? Number(a.rows[0].close) : null;
      const mon = addDaysYmd(fri, 3);
      const b = await pool.query(
        `SELECT open FROM equity_closes
         WHERE ticker = $1 AND d >= $2 ORDER BY d ASC LIMIT 1`,
        [ticker, mon],
      );
      monOpen = b.rows[0] ? Number(b.rows[0].open) : null;
    }
    const gap = weekendGap(candles, funding, friClose, monOpen, fri);
    if (!gap) continue;
    await pool.query(
      `INSERT INTO weekend_gaps
         (market_id, weekend_start, perp_drift, cash_gap, short_mae, funding_banked)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (market_id, weekend_start) DO UPDATE SET
         perp_drift=EXCLUDED.perp_drift, cash_gap=EXCLUDED.cash_gap,
         short_mae=EXCLUDED.short_mae, funding_banked=EXCLUDED.funding_banked`,
      [
        market.id,
        fri,
        gap.perp_drift,
        gap.cash_gap,
        gap.short_mae,
        gap.funding_banked,
      ],
    );
  }
}

async function rebuildEarnings(market: Market) {
  if (!market.cash_ticker) return;
  const pool = getPool();
  const { rows: prints } = await pool.query(
    `SELECT print_date FROM earnings
     WHERE ticker = $1 AND print_date <= CURRENT_DATE
     ORDER BY print_date DESC LIMIT 8`,
    [market.cash_ticker],
  );
  const ticks = await fundingRates(
    market.id,
    new Date(Date.now() - 400 * 86400 * 1000),
  );
  await pool.query(`DELETE FROM earnings_windows WHERE market_id = $1`, [
    market.id,
  ]);

  for (const p of prints) {
    const printDate = String(p.print_date).slice(0, 10);
    const [start, end] = earningsWindowBounds(printDate);
    const windowRates = ticks
      .filter(([ts]) => ts >= start && ts <= end)
      .map(([, r]) => r);
    const baseStart = new Date(start.getTime() - 30 * 86400 * 1000);
    const baselineRates = ticks
      .filter(([ts]) => ts >= baseStart && ts < start)
      .map(([, r]) => r);
    const windowAvg = apr(windowRates);
    const baseline = apr(baselineRates);

    const { rows: snap } = await pool.query(
      `SELECT mark FROM ctx_snapshots
       WHERE market_id = $1 AND ts >= $2 AND ts <= $3 AND mark IS NOT NULL`,
      [market.id, start, end],
    );
    const { rows: closes } = await pool.query(
      `SELECT close FROM equity_closes
       WHERE ticker = $1 AND d BETWEEN $2::date - 5 AND $2::date + 2
       ORDER BY d`,
      [market.cash_ticker, printDate],
    );
    let peakBasis = 0;
    if (snap.length && closes.length) {
      const ref = Number(closes[closes.length - 1].close);
      if (ref) {
        peakBasis = Math.max(
          ...snap.map((s) => Math.abs(((Number(s.mark) - ref) / ref) * 100)),
        );
      }
    }

    await pool.query(
      `INSERT INTO earnings_windows
         (market_id, print_date, window_avg, delta_vs_baseline, peak_basis)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (market_id, print_date) DO UPDATE SET
         window_avg=EXCLUDED.window_avg,
         delta_vs_baseline=EXCLUDED.delta_vs_baseline,
         peak_basis=EXCLUDED.peak_basis`,
      [market.id, printDate, windowAvg, windowAvg - baseline, peakBasis],
    );
  }
  void etDateKey;
}

export async function run() {
  const markets = await loadMarkets();
  for (const m of markets) {
    const prem = await rebuildHeatmap(m.id);
    await rebuildWeekendGaps(m);
    await rebuildEarnings(m);
    console.log(
      JSON.stringify({ msg: "nightly", coin: m.coin, weekend_prem: prem }),
    );
  }
  await heartbeat("nightly", `${markets.length} markets`);

  // VACUUM cannot run inside a transaction — use a dedicated client
  const pool = getPool();
  for (const t of [
    "market_metrics_live",
    "heatmap_cells",
    "weekend_gaps",
    "earnings_windows",
  ]) {
    const c = await pool.connect();
    try {
      c.on("error", () => undefined);
      await c.query(`VACUUM ANALYZE ${t}`);
    } catch (e) {
      console.warn(JSON.stringify({ msg: "vacuum skip", t, err: String(e) }));
    } finally {
      c.release();
    }
  }
  console.log(JSON.stringify({ msg: "nightly ok" }));
}
