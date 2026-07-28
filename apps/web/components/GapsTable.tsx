"use client";

import { cls, fmt, weekendLabel } from "@/lib/format";

type Gap = {
  weekend_start: string;
  perp_drift: number;
  cash_gap: number;
  short_mae: number;
  funding_banked: number;
};

export function GapsTable({ gaps }: { gaps: Gap[] }) {
  const worstIdx = gaps.length
    ? gaps.reduce(
        (wi, g, i, arr) => (g.short_mae > arr[wi].short_mae ? i : wi),
        0,
      )
    : -1;

  return (
    <section className="mt-5 border border-[var(--line)] bg-[var(--panel)]" aria-label="Weekend gap history">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] px-[18px] py-3.5">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
          Weekend gaps · last 8
        </h2>
        <div className="font-sans text-xs text-[var(--muted)]">
          what the perp did while your hedge was frozen
        </div>
      </div>
      <table className="font-mono w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            {["Weekend", "Perp drift", "Mon cash gap", "Short MAE", "Funding banked"].map(
              (h, i) => (
                <th
                  key={h}
                  className={`whitespace-nowrap border-b border-[var(--line)] px-3.5 py-[9px] text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--muted)] ${
                    i === 0 ? "text-left" : "text-right"
                  }`}
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {!gaps.length && (
            <tr>
              <td colSpan={5} className="px-3.5 py-3 text-[var(--muted)]">
                Need ≥ 1 weekend of candles — run backfill.
              </td>
            </tr>
          )}
          {gaps.map((g, i) => {
            // For short construction: negative perp drift is good (pos class)
            const driftGood = g.perp_drift < 0;
            const cashGood = g.cash_gap < 0;
            const worst = i === worstIdx && g.short_mae > 2;
            return (
              <tr
                key={g.weekend_start}
                style={
                  worst
                    ? {
                        background: "rgba(239,111,108,.06)",
                        boxShadow: "inset 2px 0 0 var(--coral)",
                      }
                    : undefined
                }
              >
                <td className="whitespace-nowrap border-b border-[rgba(35,45,64,.55)] px-3.5 py-[9px] text-left text-[var(--muted)]">
                  {weekendLabel(g.weekend_start)}
                </td>
                <td
                  className={`tabular whitespace-nowrap border-b border-[rgba(35,45,64,.55)] px-3.5 py-[9px] text-right ${
                    driftGood ? "pos" : g.perp_drift > 1 ? "neg" : ""
                  }`}
                >
                  {g.perp_drift > 0 ? "+" : ""}
                  {fmt(g.perp_drift, 2)}%
                </td>
                <td
                  className={`tabular whitespace-nowrap border-b border-[rgba(35,45,64,.55)] px-3.5 py-[9px] text-right ${
                    cashGood ? "pos" : g.cash_gap > 1 ? "neg" : ""
                  }`}
                >
                  {g.cash_gap > 0 ? "+" : ""}
                  {fmt(g.cash_gap, 2)}%
                </td>
                <td
                  className={`tabular whitespace-nowrap border-b border-[rgba(35,45,64,.55)] px-3.5 py-[9px] text-right ${
                    worst ? "neg" : ""
                  }`}
                >
                  +{fmt(g.short_mae, 2)}%
                </td>
                <td className={`tabular whitespace-nowrap border-b border-[rgba(35,45,64,.55)] px-3.5 py-[9px] text-right ${cls(g.funding_banked)}`}>
                  {g.funding_banked > 0 ? "+" : ""}
                  {fmt(g.funding_banked, 2)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
