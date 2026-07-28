/** Massive (Polygon.io) client + earnings CSV fallback. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type DailyBar = { t: number; o: number; c: number };
export type EarningsRow = { ticker: string; print_date: string; session: string };

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
