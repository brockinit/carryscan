/** Hyperliquid info API client — ≤10 req/s with exponential backoff on 429. */

type Json = unknown;

export class HLClient {
  private last = 0;
  private readonly minInterval: number;

  constructor(
    private baseUrl = process.env.HL_INFO_URL || "https://api.hyperliquid.xyz/info",
    maxRps = 8,
  ) {
    this.minInterval = 1000 / maxRps;
  }

  private async throttle() {
    const elapsed = Date.now() - this.last;
    if (elapsed < this.minInterval) {
      await sleep(this.minInterval - elapsed);
    }
  }

  async post(body: Record<string, unknown>, retries = 5): Promise<Json> {
    let delay = 500;
    for (let attempt = 0; attempt < retries; attempt++) {
      await this.throttle();
      try {
        const r = await fetch(this.baseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        this.last = Date.now();
        if (r.status === 429) {
          console.warn(JSON.stringify({ msg: "HL 429", delay }));
          await sleep(delay);
          delay = Math.min(delay * 2, 30000);
          continue;
        }
        if (!r.ok) throw new Error(`HL ${r.status}: ${await r.text()}`);
        return await r.json();
      } catch (e) {
        console.warn(
          JSON.stringify({
            msg: "HL request error",
            type: body.type,
            attempt: attempt + 1,
            err: String(e),
          }),
        );
        await sleep(delay);
        delay = Math.min(delay * 2, 30000);
      }
    }
    throw new Error(`HL request failed after retries: ${body.type}`);
  }

  perpDexs() {
    return this.post({ type: "perpDexs" });
  }

  async metaAndAssetCtxs(dex = "xyz"): Promise<[Meta, AssetCtx[]]> {
    const data = (await this.post({ type: "metaAndAssetCtxs", dex })) as [
      Meta,
      AssetCtx[],
    ];
    return [data[0], data[1]];
  }

  clearinghouseState(user: string, dex?: string) {
    const body: Record<string, unknown> = {
      type: "clearinghouseState",
      user,
    };
    if (dex != null && dex !== "") body.dex = dex;
    return this.post(body);
  }

  fundingHistory(coin: string, startTime: number, endTime?: number) {
    const body: Record<string, unknown> = {
      type: "fundingHistory",
      coin,
      startTime,
    };
    if (endTime != null) body.endTime = endTime;
    return this.post(body) as Promise<FundingRow[]>;
  }

  candleSnapshot(coin: string, startTime: number, endTime: number, interval = "1h") {
    return this.post({
      type: "candleSnapshot",
      req: { coin, interval, startTime, endTime },
    }) as Promise<CandleRow[]>;
  }

  async fundingHistoryPaged(coin: string, startMs: number, endMs?: number) {
    const out: FundingRow[] = [];
    let cursor = startMs;
    const end = endMs ?? Date.now();
    while (cursor < end) {
      const batch = (await this.fundingHistory(coin, cursor, end)) || [];
      if (!batch.length) break;
      out.push(...batch);
      const lastT = Math.max(...batch.map((r) => Number(r.time)));
      if (lastT <= cursor) break;
      cursor = lastT + 1;
      if (batch.length < 100) break;
    }
    return out;
  }
}

export type Meta = {
  universe: Array<{ name: string; maxLeverage?: number }>;
};
export type AssetCtx = {
  funding?: string;
  openInterest?: string;
  prevDayPx?: string;
  markPx?: string;
  oraclePx?: string;
  midPx?: string;
  premium?: string;
  dayNtlVlm?: string;
};
export type FundingRow = {
  coin: string;
  fundingRate: string;
  premium?: string;
  time: number | string;
};
export type CandleRow = {
  t: number | string;
  o: string;
  h: string;
  l: string;
  c: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
