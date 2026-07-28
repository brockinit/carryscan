export function fmt(n: number, d = 1): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

export function cls(n: number): string {
  if (n > 0) return "pos";
  if (n < 0) return "neg";
  return "dim";
}

export function signedPct(n: number, d = 1): string {
  return `${n > 0 ? "+" : ""}${fmt(n, d)}%`;
}

export function formatMark(mark: number): string {
  return mark > 1000 ? fmt(mark, 0) : fmt(mark, 2);
}

export function formatOi(usd: number): string {
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2).replace(/\.?0+$/, "")}B`;
  if (usd >= 1e6) return `$${Math.round(usd / 1e6)}M`;
  if (usd >= 1e3) return `$${Math.round(usd / 1e3)}K`;
  return `$${fmt(usd, 0)}`;
}

export function formatOiShort(usd: number): string {
  // table column style: $214M
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}B`;
  return `$${Math.round(usd / 1e6)}M`;
}

export function secondsAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 1000));
}

export function formatStatusTime(d = new Date()): string {
  return d.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).replace(",", " ·");
}

export function weekendLabel(weekendStart: string): string {
  // weekend_start is Friday date → "Jul 25–26"
  const fri = new Date(weekendStart + "T12:00:00Z");
  const sat = new Date(fri);
  sat.setUTCDate(sat.getUTCDate() + 1);
  const sun = new Date(fri);
  sun.setUTCDate(sun.getUTCDate() + 2);
  const fmtD = (x: Date) =>
    x.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmtD(sat)}–${sun.getUTCDate()}`;
}

export function printLabel(printDate: string): string {
  const d = new Date(printDate + "T12:00:00Z");
  const mon = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = d.getUTCDate();
  const yy = String(d.getUTCFullYear()).slice(2);
  return `${mon} ${day} '${yy}`;
}
