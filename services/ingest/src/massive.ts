/** Massive (Polygon.io) client + earnings CSV fallback. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type DailyBar = { t: number; o: number; c: number; vw?: number };
export type EarningsRow = { ticker: string; print_date: string; session: string };
export type QuoteSnap = {
  bid: number | null;
  ask: number | null;
  mid: number | null;
  last: number | null;
};

export class MassiveClient {
  constructor(
    private apiKey = process.env.MASSIVE_API_KEY || "",
    private baseUrl = "https://api.polygon.io",
  ) {}

  get enabled() {
    return Boolean(this.apiKey);
  }

  async dailyBars(ticker: string, from: string, to: string): Promise<DailyBar[]> {
    if (!this.enabled) {
      console.warn(JSON.stringify({ msg: "MASSIVE_API_KEY unset", ticker }));
      return [];
    }
    const url = `${this.baseUrl}/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${this.apiKey}`;
    const r = await fetch(url);
    if (r.status === 403) {
      console.warn(JSON.stringify({ msg: "Massive 403", ticker }));
      return [];
    }
    if (!r.ok) throw new Error(`Massive ${r.status}`);
    const data = (await r.json()) as { results?: DailyBar[] };
    return data.results || [];
  }

  /** NBBO / last trade snapshot (requires appropriate Massive plan). */
  async snapshotQuote(ticker: string): Promise<QuoteSnap | null> {
    if (!this.enabled) return null;
    const url = `${this.baseUrl}/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${this.apiKey}`;
    try {
      const r = await fetch(url);
      if (!r.ok) {
        console.warn(JSON.stringify({ msg: "Massive snapshot", ticker, status: r.status }));
        return null;
      }
      const data = (await r.json()) as {
        ticker?: {
          lastTrade?: { p?: number };
          lastQuote?: { p?: number; P?: number; bid?: number; ask?: number };
          day?: { vw?: number; c?: number };
          min?: { c?: number; vw?: number };
        };
      };
      const t = data.ticker;
      if (!t) return null;
      const bid = t.lastQuote?.p ?? t.lastQuote?.bid ?? null;
      const ask = t.lastQuote?.P ?? t.lastQuote?.ask ?? null;
      const last = t.lastTrade?.p ?? t.min?.c ?? t.day?.c ?? null;
      const mid =
        bid != null && ask != null && bid > 0 && ask > 0
          ? (bid + ask) / 2
          : last;
      return {
        bid: bid != null ? Number(bid) : null,
        ask: ask != null ? Number(ask) : null,
        mid: mid != null ? Number(mid) : null,
        last: last != null ? Number(last) : null,
      };
    } catch (e) {
      console.warn(JSON.stringify({ msg: "Massive snapshot err", ticker, err: String(e) }));
      return null;
    }
  }

  async dayVwap(ticker: string, day: string): Promise<number | null> {
    const bars = await this.dailyBars(ticker, day, day);
    const vw = bars[0]?.vw;
    return vw != null && Number.isFinite(Number(vw)) ? Number(vw) : null;
  }

  loadEarningsCsv(path?: string): EarningsRow[] {
    const candidates = [
      path,
      process.env.EARNINGS_CSV,
      resolve(process.cwd(), "db/seed/earnings.csv"),
      resolve(process.cwd(), "../../db/seed/earnings.csv"),
      "/app/db/seed/earnings.csv",
    ].filter(Boolean) as string[];

    let file = "";
    for (const c of candidates) {
      try {
        readFileSync(c);
        file = c;
        break;
      } catch {
        /* try next */
      }
    }
    if (!file) throw new Error("earnings.csv not found");

    const text = readFileSync(file, "utf8");
    const lines = text.trim().split(/\r?\n/);
    const header = lines[0].split(",");
    const ti = header.indexOf("ticker");
    const di = header.indexOf("print_date");
    const si = header.indexOf("session");
    return lines.slice(1).map((line) => {
      const cols = line.split(",");
      return {
        ticker: cols[ti].trim(),
        print_date: cols[di].trim(),
        session: (cols[si] || "tbd").trim() || "tbd",
      };
    });
  }
}
