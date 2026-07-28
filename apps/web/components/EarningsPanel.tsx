"use client";

import { cls, fmt, printLabel } from "@/lib/format";

type Win = {
  print_date: string;
  window_avg: number;
  delta_vs_baseline: number;
  peak_basis: number;
};

type Next = {
  print_date: string;
  session: string;
  estimated: boolean;
} | null;

function sessionLabel(s: string) {
  if (s === "amc") return "after close";
  if (s === "bmo") return "before open";
  return "tbd";
}

function nextLabel(n: Next) {
  if (!n) return "none on record";
  const d = new Date(n.print_date + "T12:00:00Z");
  const label = d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${label} · ${sessionLabel(n.session)}${n.estimated ? " (est.)" : ""}`;
}

export function EarningsPanel({
  next,
  windows,
}: {
  next: Next;
  windows: Win[];
}) {
  const avgDelta =
    windows.length > 0
      ? windows.reduce((s, w) => s + w.delta_vs_baseline, 0) / windows.length
      : 0;
  const avgPeak =
    windows.length > 0
      ? windows.reduce((s, w) => s + w.peak_basis, 0) / windows.length
      : 0;

  return (
    <section className="mt-5 border border-[var(--line)] bg-[var(--panel)]" aria-label="Earnings windows">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] px-[18px] py-3.5">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
          Earnings windows · T−3 → T+1
        </h2>
        <div className="font-sans text-xs text-[var(--muted)]">
          next print:{" "}
          <b className="font-medium text-[var(--gold-hi)]">{nextLabel(next)}</b>
        </div>
      </div>
      <table className="font-mono w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            {["Print", "Funding avg", "vs baseline", "Peak basis"].map((h, i) => (
              <th
                key={h}
                className={`whitespace-nowrap border-b border-[var(--line)] px-3.5 py-[9px] text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--muted)] ${
                  i === 0 ? "text-left" : "text-right"
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!windows.length && (
            <tr>
              <td colSpan={4} className="px-3.5 py-3 text-[var(--muted)]">
                No prints yet on record
              </td>
            </tr>
          )}
          {windows.map((w) => (
            <tr key={w.print_date}>
              <td className="whitespace-nowrap border-b border-[rgba(35,45,64,.55)] px-3.5 py-[9px] text-left text-[var(--muted)]">
                {printLabel(w.print_date)}
              </td>
              <td className={`tabular whitespace-nowrap border-b border-[rgba(35,45,64,.55)] px-3.5 py-[9px] text-right ${cls(w.window_avg)}`}>
                {signed(w.window_avg)}%
              </td>
              <td className={`tabular whitespace-nowrap border-b border-[rgba(35,45,64,.55)] px-3.5 py-[9px] text-right ${cls(w.delta_vs_baseline)}`}>
                {signed(w.delta_vs_baseline)} pts
              </td>
              <td className="tabular whitespace-nowrap border-b border-[rgba(35,45,64,.55)] px-3.5 py-[9px] text-right">
                {fmt(w.peak_basis, 2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {windows.length > 0 && (
        <div className="px-[18px] pb-[18px] pt-3 text-xs text-[var(--muted)]">
          Funding runs ≈ {avgDelta > 0 ? "+" : ""}
          {fmt(avgDelta, 0)} pts hot into prints; basis widens toward{" "}
          {fmt(avgPeak, 1)}% and mean-reverts by T+1. Earnings weekends compound
          both effects.
        </div>
      )}
    </section>
  );
}

function signed(n: number) {
  return `${n > 0 ? "+" : ""}${fmt(n)}`;
}
