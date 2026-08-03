"use client";

import { fmt } from "@/lib/format";
import type { MarketsResponse } from "@/lib/types";

type Props = {
  loading: boolean;
  summary: MarketsResponse["positioning_summary"] | undefined;
  marketCount: number;
};

function tick(coin: string | undefined) {
  if (!coin) return "—";
  return coin.includes(":") ? coin.split(":")[1] : coin;
}

export function RadarSummary({ loading, summary, marketCount }: Props) {
  const long = summary?.most_long;
  const short = summary?.most_short;

  return (
    <section className="strip" aria-label="Positioning summary">
      <div className="cell">
        <div className="k">Most long-crowded</div>
        <div className="v amber">
          {loading || !long ? (
            "—"
          ) : (
            <>
              {tick(long.coin)} · {fmt(long.crowd_score, 0)}
              <small>score</small>
            </>
          )}
        </div>
      </div>
      <div className="cell">
        <div className="k">Most short-crowded</div>
        <div className="v">
          {loading || !short ? (
            "—"
          ) : (
            <>
              <span className="neg">
                {tick(short.coin)} · {fmt(short.crowd_score, 0)}
              </span>
              <small>score</small>
            </>
          )}
        </div>
      </div>
      <div className="cell">
        <div className="k">Acute pressure</div>
        <div className="v">
          {loading || !summary ? (
            "—"
          ) : (
            <>
              {summary.acute_count}
              <small>of {marketCount} mkts</small>
            </>
          )}
        </div>
      </div>
      <div className="cell">
        <div className="k">Median |crowd|</div>
        <div className="v">
          {loading || !summary ? (
            "—"
          ) : (
            <>
              {fmt(summary.median_abs_score, 0)}
              <small>dispersion</small>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
