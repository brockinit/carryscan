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
    <section className="panel" aria-label="Earnings windows">
      <div className="shead">
        <h2>Earnings windows · T−3 → T+1</h2>
        <div className="note">
          next print: <b>{nextLabel(next)}</b>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            {["Print", "Funding avg", "vs baseline", "Peak basis"].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!windows.length && (
            <tr>
              <td colSpan={4}>No prints yet on record</td>
            </tr>
          )}
          {windows.map((w) => (
            <tr key={w.print_date}>
              <td>{printLabel(w.print_date)}</td>
              <td className={cls(w.window_avg)}>{signed(w.window_avg)}%</td>
              <td className={cls(w.delta_vs_baseline)}>
                {signed(w.delta_vs_baseline)} pts
              </td>
              <td>{fmt(w.peak_basis, 2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      {windows.length > 0 && (
        <div className="pad" style={{ paddingTop: 12, fontSize: 12, color: "var(--muted)" }}>
          Funding runs ≈ {avgDelta > 0 ? "+" : ""}
          {fmt(avgDelta, 0)} pts hot into prints; basis widens toward {fmt(avgPeak, 1)}% and
          mean-reverts by T+1. Earnings weekends compound both effects.
        </div>
      )}
    </section>
  );
}

function signed(n: number) {
  return `${n > 0 ? "+" : ""}${fmt(n)}`;
}
