"use client";

import useSWR from "swr";
import type { RiskResponse } from "@/lib/types";
import { fmt, formatOi } from "@/lib/format";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function RiskStrip() {
  const { data } = useSWR<RiskResponse>("/api/risk", fetcher, {
    refreshInterval: 60_000,
  });

  if (!data?.configured || !data.positions.length) return null;

  const worst = [...data.positions].sort(
    (a, b) => (a.distance_pct ?? 999) - (b.distance_pct ?? 999),
  )[0];

  return (
    <section className="strip fade d2" aria-label="HL margin risk" style={{ marginTop: 16 }}>
      <div className="cell">
        <div className="k">Watch wallet</div>
        <div className="v" style={{ fontSize: "1rem" }}>
          {data.address?.slice(0, 6)}…{data.address?.slice(-4)}
        </div>
      </div>
      <div className="cell">
        <div className="k">Account value</div>
        <div className="v">
          {data.account_value == null ? "—" : formatOi(data.account_value)}
        </div>
      </div>
      <div className="cell">
        <div className="k">Margin used</div>
        <div className="v">
          {data.total_margin_used == null
            ? "—"
            : formatOi(data.total_margin_used)}
        </div>
      </div>
      <div className="cell">
        <div className="k">Tightest liq distance</div>
        <div className={`v ${worst?.distance_pct != null && worst.distance_pct < 5 ? "" : "up"}`}>
          {worst ? (
            <>
              {worst.coin.includes(":") ? worst.coin.split(":")[1] : worst.coin}
              {" · "}
              {worst.distance_pct == null ? "—" : `${fmt(worst.distance_pct)}%`}
              <small>
                {worst.szi < 0 ? "short" : "long"}
                {worst.mark != null ? ` @ ${fmt(worst.mark, 2)}` : ""}
              </small>
            </>
          ) : (
            "—"
          )}
        </div>
      </div>
    </section>
  );
}
