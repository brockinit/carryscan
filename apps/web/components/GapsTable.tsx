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
    <section className="panel" aria-label="Weekend gap history">
      <div className="shead">
        <h2>Weekend gaps · last 8</h2>
        <div className="note">what the perp did while your hedge was frozen</div>
      </div>
      <table>
        <thead>
          <tr>
            {["Weekend", "Perp drift", "Mon cash gap", "Short MAE", "Funding banked"].map(
              (h) => (
                <th key={h}>{h}</th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {!gaps.length && (
            <tr>
              <td colSpan={5}>Need ≥ 1 weekend of candles — run backfill.</td>
            </tr>
          )}
          {gaps.map((g, i) => {
            const driftGood = g.perp_drift < 0;
            const cashGood = g.cash_gap < 0;
            const worst = i === worstIdx && g.short_mae > 2;
            return (
              <tr key={g.weekend_start} className={worst ? "worst" : undefined}>
                <td>{weekendLabel(g.weekend_start)}</td>
                <td className={driftGood ? "pos" : g.perp_drift > 1 ? "neg" : ""}>
                  {g.perp_drift > 0 ? "+" : ""}
                  {fmt(g.perp_drift, 2)}%
                </td>
                <td className={cashGood ? "pos" : g.cash_gap > 1 ? "neg" : ""}>
                  {g.cash_gap > 0 ? "+" : ""}
                  {fmt(g.cash_gap, 2)}%
                </td>
                <td className={worst ? "neg" : ""}>+{fmt(g.short_mae, 2)}%</td>
                <td className={cls(g.funding_banked)}>
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
