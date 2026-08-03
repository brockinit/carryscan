/** Hyperliquid info client for serverless live mode (no DB). */

const HL_URL =
  process.env.HL_INFO_URL || "https://api.hyperliquid.xyz/info";

export type SeedMarket = {
  coin: string;
  ticker: string;
  name: string;
  ref_type: "stock" | "etf_proxy" | "none";
};

export const SEED_MARKETS: SeedMarket[] = [
  { coin: "xyz:SPCX", ticker: "SPCX", name: "SpaceX Corp", ref_type: "stock" },
  { coin: "xyz:TSLA", ticker: "TSLA", name: "Tesla Inc", ref_type: "stock" },
  { coin: "xyz:NVDA", ticker: "NVDA", name: "NVIDIA Corp", ref_type: "stock" },
  { coin: "xyz:MSTR", ticker: "MSTR", name: "Strategy Inc", ref_type: "stock" },
  { coin: "xyz:HOOD", ticker: "HOOD", name: "Robinhood Markets", ref_type: "stock" },
  { coin: "xyz:COIN", ticker: "COIN", name: "Coinbase Global", ref_type: "stock" },
  { coin: "xyz:PLTR", ticker: "PLTR", name: "Palantir Technologies", ref_type: "stock" },
  { coin: "xyz:AMD", ticker: "AMD", name: "Advanced Micro Devices", ref_type: "stock" },
  { coin: "xyz:AAPL", ticker: "AAPL", name: "Apple Inc", ref_type: "stock" },
  { coin: "xyz:MSFT", ticker: "MSFT", name: "Microsoft Corp", ref_type: "stock" },
  { coin: "xyz:META", ticker: "META", name: "Meta Platforms", ref_type: "stock" },
  { coin: "xyz:AMZN", ticker: "AMZN", name: "Amazon.com", ref_type: "stock" },
  { coin: "xyz:GOOGL", ticker: "GOOGL", name: "Alphabet Inc", ref_type: "stock" },
  { coin: "xyz:XYZ100", ticker: "XYZ100", name: "Top-100 index", ref_type: "etf_proxy" },
];

const HOURS_PER_YEAR = 24 * 365;

export function hourlyToApr(rate: number): number {
  return rate * HOURS_PER_YEAR * 100;
}

export async function hlPost(body: Record<string, unknown>) {
  const r = await fetch(HL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    next: { revalidate: 0 },
  });
  if (!r.ok) throw new Error(`HL ${r.status}: ${await r.text()}`);
  return r.json();
}

export type AssetCtx = {
  funding?: string;
  openInterest?: string;
  markPx?: string;
  oraclePx?: string;
  midPx?: string;
  prevDayPx?: string;
  premium?: string;
};

export async function fetchXyzCtxs(): Promise<{
  byCoin: Map<string, AssetCtx>;
  asOf: string;
}> {
  return fetchDexCtxs("xyz");
}

export async function fetchDexCtxs(dex: string): Promise<{
  byCoin: Map<string, AssetCtx & { maxLeverage?: number | null }>;
  asOf: string;
}> {
  const data = (await hlPost({ type: "metaAndAssetCtxs", dex })) as [
    { universe: Array<{ name: string; maxLeverage?: number }> },
    AssetCtx[],
  ];
  const [meta, ctxs] = data;
  const byCoin = new Map<string, AssetCtx & { maxLeverage?: number | null }>();
  meta.universe.forEach((u, i) => {
    if (ctxs[i]) {
      byCoin.set(u.name, {
        ...ctxs[i],
        maxLeverage: u.maxLeverage ?? null,
      });
    }
  });
  return { byCoin, asOf: new Date().toISOString() };
}

/** List HIP-3 dex names (excludes null main-dex slot). */
export async function fetchHip3DexNames(): Promise<string[]> {
  try {
    const raw = (await hlPost({ type: "perpDexs" })) as Array<{
      name?: string;
    } | null>;
    const names = (raw || [])
      .filter((d): d is { name: string } => Boolean(d && d.name))
      .map((d) => d.name);
    if (!names.includes("xyz")) names.unshift("xyz");
    return names;
  } catch {
    return ["xyz"];
  }
}

export async function fetchClearinghouseState(user: string, dex?: string) {
  const body: Record<string, unknown> = {
    type: "clearinghouseState",
    user,
  };
  if (dex) body.dex = dex;
  return hlPost(body);
}

export async function fetchFundingHistory(
  coin: string,
  startMs: number,
  endMs = Date.now(),
): Promise<Array<{ time: number; fundingRate: number }>> {
  const out: Array<{ time: number; fundingRate: number }> = [];
  let cursor = startMs;
  for (let page = 0; page < 40 && cursor < endMs; page++) {
    const batch = (await hlPost({
      type: "fundingHistory",
      coin,
      startTime: cursor,
      endTime: endMs,
    })) as Array<{ time: number | string; fundingRate: string }>;
    if (!batch?.length) break;
    for (const row of batch) {
      out.push({
        time: Number(row.time),
        fundingRate: Number(row.fundingRate),
      });
    }
    const last = Math.max(...batch.map((r) => Number(r.time)));
    if (last <= cursor) break;
    cursor = last + 1;
    if (batch.length < 100) break;
  }
  return out;
}

export function windowApr(
  rates: number[],
  fallbackHourly?: number,
): number {
  if (rates.length) {
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    return mean * HOURS_PER_YEAR * 100;
  }
  if (fallbackHourly != null) return hourlyToApr(fallbackHourly);
  return 0;
}

export function sparkFromRates(
  ticks: Array<{ time: number; fundingRate: number }>,
  n = 14,
): number[] {
  if (!ticks.length) return Array(n).fill(0);
  const sorted = [...ticks].sort((a, b) => a.time - b.time);
  const end = sorted[sorted.length - 1].time;
  const start = end - 12 * n * 3600 * 1000;
  const buckets: number[][] = Array.from({ length: n }, () => []);
  for (const t of sorted) {
    if (t.time < start) continue;
    const idx = Math.floor((t.time - start) / (12 * 3600 * 1000));
    if (idx >= 0 && idx < n) buckets[idx].push(t.fundingRate);
  }
  return buckets.map((b) =>
    b.length
      ? Math.round(
          (b.reduce((a, x) => a + x, 0) / b.length) * HOURS_PER_YEAR * 100 * 100,
        ) / 100
      : 0,
  );
}

export function etDowHour(ms: number): [number, number] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  return [map[wd] ?? 0, hour];
}
