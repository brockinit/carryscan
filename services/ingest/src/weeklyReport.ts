/**
 * Generate apps/web/content/weekly/YYYY-MM-DD.json from live/prod markets API.
 * Usage: PUBLIC_BASE_URL=https://carryscan.vercel.app npm run weekly
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const base =
  process.env.PUBLIC_BASE_URL ||
  process.env.CARRYSCAN_URL ||
  "https://carryscan.vercel.app";

type Market = {
  coin: string;
  ticker: string;
  apr_7d: number;
  apr_now: number;
  borrow_default_pct?: number;
  borrow_pct?: number | null;
  capacity?: { label: string };
  positioning?: { regime: string; regime_label: string; spike_pts: number; note: string };
  oi_usd: number;
};

function fridayEt(d = new Date()): string {
  const key = d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const dt = new Date(key + "T12:00:00Z");
  while (dt.getUTCDay() !== 5) {
    dt.setUTCDate(dt.getUTCDate() - 1);
  }
  return dt.toISOString().slice(0, 10);
}

function net(apr7: number, borrow: number) {
  const feeDrag = (10 / 100) * (365 / 30);
  return apr7 - borrow - feeDrag;
}

async function main() {
  const r = await fetch(`${base.replace(/\/$/, "")}/api/markets`);
  if (!r.ok) throw new Error(`markets ${r.status}`);
  const data = (await r.json()) as {
    as_of: string | null;
    markets: Market[];
    summary?: { weekend_premium_pts?: number };
  };

  const rows = data.markets.map((m) => {
    const borrow = m.borrow_pct ?? m.borrow_default_pct ?? 5.5;
    return { ...m, borrow, net7: net(m.apr_7d, borrow) };
  });
  rows.sort((a, b) => b.net7 - a.net7);

  const acute = rows.filter(
    (m) =>
      m.positioning?.regime === "acute_long" ||
      m.positioning?.regime === "acute_short",
  );
  const longC = rows.filter((m) => m.positioning?.regime === "long_crowded");
  const shortC = rows.filter((m) => m.positioning?.regime === "short_crowded");

  const findings = [];
  for (const m of acute.slice(0, 4)) {
    findings.push({
      title: `${m.ticker} · ${m.positioning!.regime_label}`,
      body: m.positioning!.note,
      severity: "high" as const,
      tickers: [m.coin],
      theme: "positioning" as const,
    });
  }
  if (rows[0] && rows[0].net7 > 3) {
    findings.push({
      title: `Richest net: ${rows[0].ticker}`,
      body: `7d net ~${rows[0].net7.toFixed(1)}% after ${rows[0].borrow}% borrow (indicative/IBKR). Capacity ${rows[0].capacity?.label ?? "n/a"}.`,
      severity: "notable" as const,
      tickers: [rows[0].coin],
      theme: "carry" as const,
    });
  }
  const thinRich = rows.filter(
    (m) => m.capacity?.label === "thin" && Math.abs(m.apr_7d) >= 12,
  );
  for (const m of thinRich.slice(0, 2)) {
    findings.push({
      title: `${m.ticker} · rich funding, thin book`,
      body: `7d APR ${m.apr_7d.toFixed(1)}% with thin OI ($${(m.oi_usd / 1e6).toFixed(0)}M). Size carefully.`,
      severity: "notable" as const,
      tickers: [m.coin],
      theme: "risk" as const,
    });
  }
  const wp = data.summary?.weekend_premium_pts ?? 0;
  findings.push({
    title: "Weekend premium (OI-weighted)",
    body:
      wp === 0
        ? "Weekend premium unavailable or flat — do not assume hot weekend carry."
        : `OI-weighted weekend premium ${wp > 0 ? "+" : ""}${wp.toFixed(1)} pts vs weekday.`,
    severity: Math.abs(wp) >= 5 ? ("notable" as const) : ("info" as const),
    theme: "weekend" as const,
  });

  const weekOf = fridayEt();
  const report = {
    week_of: weekOf,
    published_at: new Date().toISOString(),
    headline: `HIP-3 scorecard · week of ${weekOf}`,
    summary: `Top net ${rows[0]?.ticker ?? "—"} at ${rows[0]?.net7.toFixed(1) ?? "—"}%. Acute pressure on ${acute.length} names; long-crowded ${longC.length}; short-crowded ${shortC.length}.`,
    findings,
    top_carry: rows.slice(0, 8).map((m) => ({
      ticker: m.ticker,
      coin: m.coin,
      net_7d: Math.round(m.net7 * 10) / 10,
      apr_7d: Math.round(m.apr_7d * 10) / 10,
      note: m.capacity ? `cap ${m.capacity.label}` : undefined,
    })),
    regimes: {
      acute: acute.map((m) => m.ticker),
      long_crowded: longC.map((m) => m.ticker),
      short_crowded: shortC.map((m) => m.ticker),
    },
    weekend_note:
      wp === 0
        ? "No reliable weekend premium in this snapshot — check heatmaps per name before Fri holds."
        : `Pack weekend premium ${wp > 0 ? "+" : ""}${wp.toFixed(1)} pts; still size off short MAE vs funding banked.`,
    as_of: data.as_of,
    source: "automation" as const,
  };

  const candidates = [
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../apps/web/content/weekly"),
    path.resolve(process.cwd(), "../../apps/web/content/weekly"),
    path.resolve(process.cwd(), "apps/web/content/weekly"),
  ];
  const outDir = candidates.find((d) => {
    try {
      fs.mkdirSync(d, { recursive: true });
      return true;
    } catch {
      return false;
    }
  });
  if (!outDir) throw new Error("cannot resolve content/weekly");
  const file = path.join(outDir, `${weekOf}.json`);
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ msg: "weekly written", file, findings: findings.length }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
