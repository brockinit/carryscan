import fs from "fs";
import path from "path";

export type WeeklyFinding = {
  title: string;
  body: string;
  severity: "info" | "notable" | "high";
  tickers?: string[];
  theme: "carry" | "positioning" | "risk" | "weekend" | "regime";
};

export type WeeklyReport = {
  /** Friday date of the week being scored, YYYY-MM-DD (ET) */
  week_of: string;
  published_at: string;
  headline: string;
  summary: string;
  findings: WeeklyFinding[];
  top_carry: Array<{
    ticker: string;
    coin: string;
    net_7d: number;
    apr_7d: number;
    note?: string;
  }>;
  regimes: {
    acute: string[];
    long_crowded: string[];
    short_crowded: string[];
  };
  weekend_note: string;
  as_of: string | null;
  source: "automation" | "manual";
};

const DIR = path.join(process.cwd(), "content", "weekly");

function isReport(x: unknown): x is WeeklyReport {
  if (!x || typeof x !== "object") return false;
  const r = x as WeeklyReport;
  return (
    typeof r.week_of === "string" &&
    typeof r.headline === "string" &&
    Array.isArray(r.findings)
  );
}

export function listWeeklyReportDates(): string[] {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""))
    .sort()
    .reverse();
}

export function readWeeklyReport(weekOf: string): WeeklyReport | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) return null;
  const file = path.join(DIR, `${weekOf}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return isReport(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function latestWeeklyReport(): WeeklyReport | null {
  const dates = listWeeklyReportDates();
  if (!dates.length) return null;
  return readWeeklyReport(dates[0]);
}
