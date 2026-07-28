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
  if (!r.ok) throw Object.assign(new Error(body.error || "error"), { body, status: r.status });
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
      <div>
        <div className="font-mono text-xs">
          <Link href="/" className="text-[var(--muted)] no-underline hover:text-[var(--gold-hi)]">
            ← All markets
          </Link>
        </div>
        <h1 className="font-disp mt-6 text-3xl font-bold">Unknown market</h1>
        <p className="font-mono mt-2 text-[var(--muted)]">{coin}</p>
        <ul className="font-mono mt-6 space-y-1 text-sm text-[var(--muted)]">
          {known.map((k) => (
            <li key={k}>
              <Link className="text-[var(--gold-hi)]" href={`/m/${encodeURIComponent(k)}`}>
                {k}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const live = data?.live;
  const net =
    live != null
      ? netCarry(live.apr_7d, carryParams.borrowPct, carryParams.feesRtBps, 30)
      : 0;

  return (
    <>
      <div className="fade font-mono text-xs">
        <Link href="/" className="text-[var(--muted)] no-underline hover:text-[var(--gold-hi)]">
          ← All markets
        </Link>
      </div>

      <div className="fade d1 mt-3.5 flex flex-wrap items-baseline gap-x-[26px] gap-y-3.5">
        <div className="font-disp text-[42px] font-bold leading-none tracking-[-0.01em]">
          {data?.ticker || "…"}
          <small className="font-mono mt-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
            {data?.name || (isLoading ? "loading…" : "—")} · xyz dex · Hyperliquid
          </small>
        </div>
        <div className="ml-auto flex flex-wrap gap-px border border-[var(--line)] bg-[var(--line)]">
          <Stat k="Mark" v={live ? formatMark(live.mark) : "—"} />
          <Stat
            k="Basis vs close"
            v={
              live?.basis_pct != null ? signedPct(live.basis_pct, 2) : "—"
            }
            cls={live?.basis_pct != null ? cls(live.basis_pct) : ""}
          />
          <Stat
            k="Funding now"
            v={live ? signedPct(live.apr_now) : "—"}
            cls={live ? cls(live.apr_now) : ""}
          />
          <Stat
            k="Net carry"
            v={live ? signedPct(net) : "—"}
            cls="text-[var(--gold-hi)]"
          />
          <Stat k="Open interest" v={live ? formatOiShort(live.oi_usd) : "—"} />
        </div>
      </div>

      {data && (
        <>
          <div className="fade d2">
            <FundingClock
              days={data.heatmap.days}
              cells={data.heatmap.cells}
              weekendPremium={data.weekend_premium_pts}
            />
          </div>

          <div className="grid gap-5 md:grid-cols-[1.7fr_1fr]">
            <div className="fade d2">
              <FundingChart
                dailyApr={data.history_30d.daily_apr}
                weekendIdx={data.history_30d.weekend_idx}
                start={data.history_30d.start}
                borrowPct={carryParams.borrowPct}
              />
            </div>
            <div className="fade d3">
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
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="fade d3">
              <GapsTable gaps={data.weekend_gaps} />
            </div>
            <div className="fade d3">
              <EarningsPanel next={data.earnings.next} windows={data.earnings.windows} />
            </div>
          </div>
        </>
      )}

      <footer className="fade d3 font-mono mt-6 flex flex-wrap justify-between gap-4 text-[11.5px] text-[var(--faint)]">
        <span>funding: Hyperliquid · cash closes: Massive · times in ET</span>
        <span>research tool — not investment advice</span>
      </footer>
    </>
  );
}

function Stat({
  k,
  v,
  cls: c = "",
}: {
  k: string;
  v: string;
  cls?: string;
}) {
  return (
    <div className="min-w-[118px] bg-[var(--panel)] px-4 py-2.5">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
        {k}
      </div>
      <div className={`font-mono tabular mt-1 text-[17px] font-semibold ${c}`}>{v}</div>
    </div>
  );
}
