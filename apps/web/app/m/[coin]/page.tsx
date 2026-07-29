"use client";

import Link from "next/link";
import useSWR from "swr";
import { useEffect, useState } from "react";
import type { MarketDetail } from "@/lib/types";
import {
  DEFAULT_PARAMS,
  loadParams,
  netCarry,
  saveParams,
  type CarryParams,
} from "@/lib/carry";
import { cls, formatMark, formatOiShort, signedPct } from "@/lib/format";
import { FundingClock } from "@/components/FundingClock";
import { FundingChart } from "@/components/FundingChart";
import { CarryCalc } from "@/components/CarryCalc";
import { GapsTable } from "@/components/GapsTable";
import { EarningsPanel } from "@/components/EarningsPanel";

const fetcher = async (url: string) => {
  const r = await fetch(url);
  const body = await r.json();
  if (!r.ok)
    throw Object.assign(new Error(body.error || "error"), {
      body,
      status: r.status,
    });
  return body as MarketDetail;
};

export default function MarketDetailPage({
  params,
}: {
  params: { coin: string };
}) {
  const coin = decodeURIComponent(params.coin);
  const { data, error, isLoading } = useSWR<MarketDetail>(
    `/api/markets/${encodeURIComponent(coin)}`,
    fetcher,
    { refreshInterval: 30000 },
  );

  const [carryParams, setCarryParams] = useState<CarryParams>(DEFAULT_PARAMS);
  useEffect(() => {
    setCarryParams(loadParams());
  }, []);

  const update = (patch: Partial<CarryParams>) => {
    setCarryParams((p) => {
      const next = { ...p, ...patch };
      saveParams(next);
      return next;
    });
  };

  if (error && (error as { status?: number }).status === 404) {
    const known = (error as { body?: { known?: string[] } }).body?.known || [];
    return (
      <>
        <div className="crumb">
          <Link href="/">← All markets</Link>
        </div>
        <h1 className="page-title">Unknown market</h1>
        <p className="page-dek font-mono">{coin}</p>
        <ul style={{ marginTop: 24, color: "var(--muted)", fontSize: 14 }}>
          {known.map((k) => (
            <li key={k} style={{ marginBottom: 6 }}>
              <Link href={`/m/${encodeURIComponent(k)}`} style={{ color: "var(--mint)" }}>
                {k}
              </Link>
            </li>
          ))}
        </ul>
      </>
    );
  }

  const live = data?.live;
  const net =
    live != null
      ? netCarry(live.apr_7d, carryParams.borrowPct, carryParams.feesRtBps, 30)
      : 0;

  return (
    <>
      <div className="crumb fade">
        <Link href="/">← All markets</Link>
      </div>

      <div className="mkthead fade d1">
        <div className="bigtick">
          {data?.ticker || "…"}
          <small>
            {data?.name || (isLoading ? "loading…" : "—")} · xyz dex · Hyperliquid
          </small>
        </div>
        <div className="stats">
          <Stat k="Mark" v={live ? formatMark(live.mark) : "—"} />
          <Stat
            k="Basis vs close"
            v={live?.basis_pct != null ? signedPct(live.basis_pct, 2) : "—"}
            c={live?.basis_pct != null ? cls(live.basis_pct) : ""}
          />
          <Stat
            k="Funding now"
            v={live ? signedPct(live.apr_now) : "—"}
            c={live ? cls(live.apr_now) : ""}
          />
          <Stat k="Net carry" v={live ? signedPct(net) : "—"} c="amber" />
          <Stat k="Open interest" v={live ? formatOiShort(live.oi_usd) : "—"} />
        </div>
      </div>

      {data && (
        <>
          <FundingClock
            days={data.heatmap.days}
            cells={data.heatmap.cells}
            weekendPremium={data.weekend_premium_pts}
          />

          <div className="grid2 fade d2">
            <FundingChart
              dailyApr={data.history_30d.daily_apr}
              weekendIdx={data.history_30d.weekend_idx}
              start={data.history_30d.start}
              borrowPct={carryParams.borrowPct}
            />
            <CarryCalc
              coin={data.coin}
              ticker={data.ticker}
              apr7d={data.live.apr_7d}
              borrowPct={carryParams.borrowPct}
              feesRtBps={carryParams.feesRtBps}
              onBorrow={(n) => update({ borrowPct: n })}
              onFees={(n) => update({ feesRtBps: n })}
            />
          </div>

          <div className="grid2 fade d3">
            <GapsTable gaps={data.weekend_gaps} />
            <EarningsPanel next={data.earnings.next} windows={data.earnings.windows} />
          </div>
        </>
      )}

      <footer className="site-footer fade d3">
        <span>funding: Hyperliquid · cash closes: Massive · times in ET</span>
        <span>research tool — not investment advice</span>
      </footer>
    </>
  );
}

function Stat({ k, v, c = "" }: { k: string; v: string; c?: string }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className={`v ${c}`} style={c === "amber" ? { color: "var(--amber)" } : undefined}>
        {v}
      </div>
    </div>
  );
}
