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
    <section className="strip" aria-label="Summary">
      <div className="cell">
        <div className="k">Richest net carry now</div>
        <div className="v amber">
          {loading || !richest ? (
            "—"
          ) : (
            <>
              {tick} · {fmt(richest.net_carry)}%
              <small>APR</small>
            </>
          )}
        </div>
      </div>
      <div className="cell">
        <div className="k">Median 7d funding</div>
        <div className="v">
          {loading || medianApr7d == null ? (
            "—"
          ) : (
            <>
              {fmt(medianApr7d)}%
              <small>APR · {marketCount} mkts</small>
            </>
          )}
        </div>
      </div>
      <div className="cell">
        <div className="k">Weekend premium · 90d</div>
        <div className="v up">
          {loading || weekendPremium == null ? (
            "—"
          ) : (
            <>
              {weekendPremium > 0 ? "+" : ""}
              {fmt(weekendPremium)}
              <small>pts APR vs weekday</small>
            </>
          )}
        </div>
        <div className="weekweek" aria-hidden>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <i key={i} className={i >= 5 ? "on" : undefined} />
          ))}
        </div>
      </div>
      <div className="cell">
        <div className="k">HIP-3 open interest</div>
        <div className="v">
          {loading || totalOi == null ? (
            "—"
          ) : (
            <>
              {formatOi(totalOi)}
              <small>Σ xyz</small>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
