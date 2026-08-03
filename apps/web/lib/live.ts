import { feeDrag, netCarry } from "@/lib/carry";
import {
  SEED_MARKETS,
  etDowHour,
  fetchDexCtxs,
  fetchFundingHistory,
  fetchHip3DexNames,
  hourlyToApr,
  sparkFromRates,
  windowApr,
} from "@/lib/hl";
import { attachPositioning, positioningSummary } from "@/lib/positioning";
import {
  attachDeskFields,
  fundingDistFromRates,
} from "@/lib/desk";

function num(v: string | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return out;
}

/** Live Hyperliquid dashboard payload when DATABASE_URL is unavailable. */
export async function liveMarketsPayload() {
  const dexs = await fetchHip3DexNames();
  const now = Date.now();
  const since = now - 30 * 86400 * 1000;

  // Build coin universe from all HIP-3 dexs; prefer seed metadata when known
  const seedByCoin = new Map(SEED_MARKETS.map((m) => [m.coin, m]));
  type LiveCoin = {
    coin: string;
    dex: string;
    ticker: string;
    name: string;
    ref_type: "stock" | "etf_proxy" | "none";
    ctx: Awaited<ReturnType<typeof fetchDexCtxs>>["byCoin"] extends Map<
      string,
      infer V
    >
      ? V
      : never;
  };
  const coins: LiveCoin[] = [];
  let asOf = new Date().toISOString();
  for (const dex of dexs) {
    try {
      const { byCoin, asOf: t } = await fetchDexCtxs(dex);
      asOf = t;
      for (const [coin, ctx] of Array.from(byCoin.entries())) {
        const seed = seedByCoin.get(coin);
        const ticker = coin.includes(":") ? coin.split(":")[1] : coin;
        coins.push({
          coin,
          dex,
          ticker: seed?.ticker ?? ticker,
          name: seed?.name ?? `Unknown ${ticker}`,
          ref_type: seed?.ref_type ?? "none",
          ctx,
        });
      }
    } catch (e) {
      console.warn("live dex failed", dex, e);
    }
  }

  // Cap live history pull for serverless time limits
  const capped = coins.slice(0, 40);

  const enriched = await mapPool(capped, 4, async (m) => {
    const ctx = m.ctx;
    const mark = num(ctx.markPx) ?? 0;
    const oiBase = num(ctx.openInterest) ?? 0;
    const funding = num(ctx.funding) ?? 0;
    const oracle = num(ctx.oraclePx);
    const aprNow = hourlyToApr(funding);
    const basisPct =
      oracle && oracle !== 0 ? ((mark - oracle) / oracle) * 100 : null;

    let ticks: Array<{ time: number; fundingRate: number }> = [];
    try {
      ticks = await fetchFundingHistory(m.coin, since, now);
    } catch (e) {
      console.warn("funding history failed", m.coin, e);
    }

    const rates1d = ticks
      .filter((t) => t.time >= now - 86400 * 1000)
      .map((t) => t.fundingRate);
    const rates7d = ticks
      .filter((t) => t.time >= now - 7 * 86400 * 1000)
      .map((t) => t.fundingRate);
    const rates30d = ticks.map((t) => t.fundingRate);

    return {
      coin: m.coin,
      dex: m.dex,
      ticker: m.ticker,
      name: m.name,
      ref_type: m.ref_type,
      mark,
      basis_pct: basisPct,
      basis_oracle_pct: basisPct,
      basis_nbbo_pct: null as number | null,
      basis_vwap_pct: null as number | null,
      max_leverage:
        ctx.maxLeverage != null ? Number(ctx.maxLeverage) : null,
      apr_now: aprNow,
      apr_1d: windowApr(rates1d, funding),
      apr_7d: windowApr(rates7d, funding),
      apr_30d: windowApr(rates30d, funding),
      oi_usd: oiBase * mark,
      spark: sparkFromRates(ticks, 14),
      _rates30d: rates30d,
    };
  });

  const dist = new Map(
    enriched.map((m) => [m.coin, fundingDistFromRates(m._rates30d)]),
  );
  const stripped = enriched.map((m) => {
    const { _rates30d, ...rest } = m;
    void _rates30d;
    return rest;
  });
  const withDesk = attachDeskFields(stripped, {
    basis_ref: "oracle",
    dist,
  });
  const markets = attachPositioning(withDesk);
  const defaults = { borrow_pct: 5.5, fees_rt_bps: 10, horizon: "7d" as const };
  const nets = markets.map((m) => ({
    coin: m.coin,
    net: netCarry(m.apr_7d, m.borrow_default_pct, defaults.fees_rt_bps, 30),
  }));
  nets.sort((a, b) => b.net - a.net);

  return {
    as_of: asOf,
    stale: false,
    live_mode: true,
    defaults,
    summary: {
      richest: nets[0]
        ? { coin: nets[0].coin, net_carry: nets[0].net }
        : null,
      median_apr_7d: median(markets.map((m) => m.apr_7d)),
      weekend_premium_pts: 0,
      total_oi_usd: markets.reduce((s, m) => s + m.oi_usd, 0),
      dex_count: dexs.length,
    },
    positioning_summary: positioningSummary(markets),
    markets,
    _fee_drag_pts: feeDrag(defaults.fees_rt_bps, 30),
  };
}

export async function liveMarketDetail(coin: string) {
  const seed = SEED_MARKETS.find((m) => m.coin === coin);
  if (!seed) {
    return {
      error: "unknown market" as const,
      known: SEED_MARKETS.map((m) => m.coin),
    };
  }

  const dex = seed.coin.includes(":") ? seed.coin.split(":")[0] : "xyz";
  const { byCoin, asOf } = await fetchDexCtxs(dex);
  const ctx = byCoin.get(coin);
  if (!ctx) {
    return {
      error: "unknown market" as const,
      known: SEED_MARKETS.filter((m) => byCoin.has(m.coin)).map((m) => m.coin),
    };
  }

  const now = Date.now();
  const ticks = await fetchFundingHistory(coin, now - 90 * 86400 * 1000, now);
  const funding = num(ctx.funding) ?? 0;
  const mark = num(ctx.markPx) ?? 0;
  const oiBase = num(ctx.openInterest) ?? 0;
  const oracle = num(ctx.oraclePx);
  const rates7d = ticks
    .filter((t) => t.time >= now - 7 * 86400 * 1000)
    .map((t) => t.fundingRate);
  const rates1d = ticks
    .filter((t) => t.time >= now - 86400 * 1000)
    .map((t) => t.fundingRate);

  const buckets = new Map<string, number[]>();
  for (const t of ticks) {
    const [d, h] = etDowHour(t.time);
    const key = `${d}:${h}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(t.fundingRate);
  }
  const cells: number[][] = [];
  for (let d = 0; d < 7; d++) {
    const row: number[] = [];
    for (let h = 0; h < 24; h++) {
      const rates = buckets.get(`${d}:${h}`) ?? [];
      row.push(windowApr(rates));
    }
    cells.push(row);
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

  const byDay = new Map<string, number[]>();
  for (const t of ticks) {
    const key = new Date(t.time).toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(t.fundingRate);
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
    daily.push(windowApr(rates));
    if (d.getUTCDay() === 6 && i > 0) {
      const idx = 29 - i;
      weekendIdx.push([idx, idx + 1]);
    }
  }

  const basisPct =
    oracle && oracle !== 0 ? ((mark - oracle) / oracle) * 100 : null;

  return {
    coin: seed.coin,
    ticker: seed.ticker,
    name: seed.name,
    ref_type: seed.ref_type,
    as_of: asOf,
    live_mode: true,
    live: {
      mark,
      basis_pct: basisPct,
      apr_now: hourlyToApr(funding),
      apr_1d: windowApr(rates1d, funding),
      apr_7d: windowApr(rates7d, funding),
      apr_30d: windowApr(
        ticks.map((t) => t.fundingRate),
        funding,
      ),
      oi_usd: oiBase * mark,
    },
    heatmap: {
      tz: "America/New_York",
      days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      cells,
    },
    weekend_premium_pts: weekendPremium,
    history_30d: {
      start: startStr,
      daily_apr: daily,
      weekend_idx: weekendIdx,
    },
    weekend_gaps: [],
    earnings: { next: null, windows: [] },
  };
}
