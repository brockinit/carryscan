import { HLClient, num } from "../hl.js";
import {
  fundingRates,
  heartbeat,
  latestClose,
  loadMarkets,
  upsertCtx,
  upsertMetricsLive,
} from "../db.js";
import { apr, basis, hourlyToApr, sparkline12h } from "../metrics/index.js";

function windowApr(rates: Array<[Date, number]>, hours: number | null): number {
  if (hours == null) {
    if (!rates.length) return 0;
    return hourlyToApr(rates[rates.length - 1][1]);
  }
  const cutoff = Date.now() - hours * 3600 * 1000;
  const subset = rates.filter(([ts]) => ts.getTime() >= cutoff).map(([, r]) => r);
  return apr(subset);
}

export async function run(hl?: HLClient) {
  const client = hl ?? new HLClient();
  const [meta, ctxs] = await client.metaAndAssetCtxs("xyz");
  const universe = meta.universe || [];
  const byName = new Map(universe.map((u, i) => [u.name, i]));

  const now = new Date();
  const markets = await loadMarkets();
  const seeded = new Set(markets.map((m) => m.coin));
  const onChain = universe.map((u) => u.name).filter(Boolean);
  const missing = onChain.filter((c) => !seeded.has(c)).sort();
  if (missing.length) {
    console.warn(
      JSON.stringify({
        msg: "xyz markets on-chain but not in markets table",
        missing: missing.slice(0, 40),
      }),
    );
  }

  for (const m of markets) {
    const idx = byName.get(m.coin);
    if (idx == null || idx >= ctxs.length) continue;
    const ctx = ctxs[idx];
    const mark = num(ctx.markPx);
    const oracle = num(ctx.oraclePx);
    const mid = num(ctx.midPx);
    const oiBase = num(ctx.openInterest);
    const prev = num(ctx.prevDayPx);
    const funding = num(ctx.funding);

    await upsertCtx(m.id, now, mark, oracle, mid, oiBase, prev);

    const since = new Date(Date.now() - 35 * 86400 * 1000);
    let ticks = await fundingRates(m.id, since);
    if (funding != null) ticks = [...ticks, [now, funding]];

    const ref = m.cash_ticker ? await latestClose(m.cash_ticker) : null;
    const basisPct =
      mark != null && ref != null ? basis(mark, ref) : null;
    const oiUsd =
      oiBase != null && mark != null ? oiBase * mark : null;

    const spark = sparkline12h(ticks, 14).map((v) => Math.round(v * 100) / 100);

    await upsertMetricsLive({
      market_id: m.id,
      as_of: now,
      mark,
      basis_pct: basisPct,
      apr_now: windowApr(ticks, null),
      apr_1d: windowApr(ticks, 24),
      apr_7d: windowApr(ticks, 24 * 7),
      apr_30d: windowApr(ticks, 24 * 30),
      oi_usd: oiUsd,
      spark,
    });
  }

  await heartbeat("snapshot", `${markets.length} markets`);
  console.log(JSON.stringify({ msg: "snapshot ok", markets: markets.length }));
}
