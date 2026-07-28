"use client";

import { formatOi, fmt } from "@/lib/format";

type Props = {
  loading: boolean;
  richest: { coin: string; net_carry: number } | null;
  medianApr7d: number | null;
  weekendPremium: number | null;
  totalOi: number | null;
  marketCount: number;
};

export function SummaryStrip({
  loading,
  richest,
  medianApr7d,
  weekendPremium,
  totalOi,
  marketCount,
}: Props) {
  const tick = richest?.coin?.includes(":")
    ? richest.coin.split(":")[1]
    : richest?.coin;

  return (
    <section
      className="fade d1 mt-[26px] mb-5 grid gap-px border border-[var(--line)] bg-[var(--line)]"
      style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}
      aria-label="Summary"
    >
      <div className="bg-[var(--panel)] px-4 py-3.5">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--muted)]">
          Richest net carry now
        </div>
        <div className="font-mono mt-1.5 text-[22px] font-semibold text-[var(--gold-hi)]">
          {loading || !richest ? (
            "—"
          ) : (
            <>
              {tick} · {fmt(richest.net_carry)}%
              <small className="ml-1.5 text-xs font-normal text-[var(--muted)]">APR</small>
            </>
          )}
        </div>
      </div>
      <div className="bg-[var(--panel)] px-4 py-3.5">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--muted)]">
          Median 7d funding
        </div>
        <div className="font-mono mt-1.5 text-[22px] font-semibold">
          {loading || medianApr7d == null ? (
            "—"
          ) : (
            <>
              {fmt(medianApr7d)}%
              <small className="ml-1.5 text-xs font-normal text-[var(--muted)]">
                APR · {marketCount} mkts
              </small>
            </>
          )}
        </div>
      </div>
      <div className="bg-[var(--panel)] px-4 py-3.5">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--muted)]">
          Weekend premium · 90d
        </div>
        <div className="font-mono mt-1.5 text-[22px] font-semibold text-[var(--mint)]">
          {loading || weekendPremium == null ? (
            "—"
          ) : (
            <>
              {weekendPremium > 0 ? "+" : ""}
              {fmt(weekendPremium)}
              <small className="ml-1.5 text-xs font-normal text-[var(--muted)]">
                pts APR vs weekday
              </small>
            </>
          )}
        </div>
        <div className="mt-2 flex gap-[3px]" aria-hidden>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <i
              key={i}
              className="block h-2 flex-1 rounded-[1px]"
              style={{
                background: i >= 5 ? "var(--gold)" : "var(--panel-2)",
                boxShadow: i >= 5 ? "0 0 8px rgba(232,181,77,.45)" : undefined,
              }}
            />
          ))}
        </div>
      </div>
      <div className="bg-[var(--panel)] px-4 py-3.5">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--muted)]">
          HIP-3 open interest
        </div>
        <div className="font-mono mt-1.5 text-[22px] font-semibold">
          {loading || totalOi == null ? (
            "—"
          ) : (
            <>
              {formatOi(totalOi)}
              <small className="ml-1.5 text-xs font-normal text-[var(--muted)]">Σ xyz</small>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
