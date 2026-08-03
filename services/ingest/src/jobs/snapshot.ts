import { HLClient, num } from "../hl.js";
import {
  fundingRates,
  heartbeat,
  latestBorrow,
  latestClose,
  latestVwap,
  listActiveDexs,
  loadMarkets,
  upsertCtx,
  upsertMetricsLive,
  upsertQuote,
  upsertVwap,
} from "../db.js";
import { apr, basis, hourlyToApr, sparkline12h } from "../metrics/index.js";
import { MassiveClient } from "../massive.js";

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
  const massive = new MassiveClient();
  const now = new Date();
  const dayKey = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const dexs = await listActiveDexs();
  const markets = await loadMarkets();
  const byDex = new Map<string, typeof markets>();
  for (const m of markets) {
    if (!byDex.has(m.dex)) byDex.set(m.dex, []);
    byDex.get(m.dex)!.push(m);
  }

  // Cache cash quotes per ticker for this snapshot
  const quoteCache = new Map<
    string,
    { mid: number | null; last: number | null; vwap: number | null }
  >();

  let n = 0;
  for (const dex of dexs) {
    const dexMarkets = byDex.get(dex) || [];
    if (!dexMarkets.length) continue;

    const [meta, ctxs] = await client.metaAndAssetCtxs(dex);
    const universe = meta.universe || [];
    const byName = new Map(universe.map((u, i) => [u.name, i]));
    const maxLev = new Map(
      universe.map((u) => [u.name, u.maxLeverage != null ? Number(u.maxLeverage) : null]),
    );

    for (const m of dexMarkets) {
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

      const cashClose = m.cash_ticker ? await latestClose(m.cash_ticker) : null;
      const basisCash =
        mark != null && cashClose != null ? basis(mark, cashClose) : null;
      const basisOracle =
        mark != null && oracle != null && oracle !== 0
          ? basis(mark, oracle)
          : null;

      let basisNbbo: number | null = null;
      let basisVwap: number | null = null;
      if (m.cash_ticker) {
        let q = quoteCache.get(m.cash_ticker);
        if (!q) {
          const snap = await massive.snapshotQuote(m.cash_ticker);
          let vwap = await latestVwap(m.cash_ticker);
          if (massive.enabled) {
            const dayVw = await massive.dayVwap(m.cash_ticker, dayKey);
            if (dayVw != null) {
              await upsertVwap(m.cash_ticker, dayKey, dayVw);
              vwap = dayVw;
            }
          }
          if (snap) {
            await upsertQuote(
              m.cash_ticker,
              now,
              snap.bid,
              snap.ask,
              snap.mid,
              snap.last,
            );
          }
          q = {
            mid: snap?.mid ?? null,
            last: snap?.last ?? null,
            vwap,
          };
          quoteCache.set(m.cash_ticker, q);
        }
        if (mark != null && q.mid != null && q.mid !== 0) {
          basisNbbo = basis(mark, q.mid);
        }
        if (mark != null && q.vwap != null && q.vwap !== 0) {
          basisVwap = basis(mark, q.vwap);
        }
      }

      let borrowPct: number | null = null;
      let borrowSource: string | null = null;
      if (m.cash_ticker) {
        const b = await latestBorrow(m.cash_ticker);
        if (b) {
          borrowPct = b.fee_rate_pct;
          borrowSource = b.source;
        }
      }

      const oiUsd =
        oiBase != null && mark != null ? oiBase * mark : null;
      const spark = sparkline12h(ticks, 14).map((v) => Math.round(v * 100) / 100);

      await upsertMetricsLive({
        market_id: m.id,
        as_of: now,
        mark,
        basis_pct: basisCash,
        basis_oracle_pct: basisOracle,
        basis_nbbo_pct: basisNbbo,
        basis_vwap_pct: basisVwap,
        borrow_pct: borrowPct,
        borrow_source: borrowSource,
        max_leverage: maxLev.get(m.coin) ?? null,
        apr_now: windowApr(ticks, null),
        apr_1d: windowApr(ticks, 24),
        apr_7d: windowApr(ticks, 24 * 7),
        apr_30d: windowApr(ticks, 24 * 30),
        oi_usd: oiUsd,
        spark,
      });
      n++;
    }
  }

  await heartbeat("snapshot", `${n} markets / ${dexs.length} dexs`);
  console.log(JSON.stringify({ msg: "snapshot ok", markets: n, dexs }));
}
