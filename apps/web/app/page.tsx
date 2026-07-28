"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import type { MarketsResponse } from "@/lib/types";
import {
  DEFAULT_PARAMS,
  aprForHorizon,
  feeDrag,
  loadParams,
  netCarry,
  saveParams,
  type CarryParams,
} from "@/lib/carry";
import { formatStatusTime, secondsAgo } from "@/lib/format";
import { SummaryStrip } from "@/components/SummaryStrip";
import { Controls } from "@/components/Controls";
import { MarketsTable } from "@/components/MarketsTable";

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error("unreachable");
    return r.json();
  });

export default function DashboardPage() {
  const { data, error, isLoading } = useSWR<MarketsResponse>("/api/markets", fetcher, {
    refreshInterval: 30000,
  });

  const [params, setParams] = useState<CarryParams>(DEFAULT_PARAMS);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "stock" | "etf_proxy">("all");
  const [retryIn, setRetryIn] = useState(5);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setParams(loadParams());
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!error) return;
    setRetryIn(5);
    const t = setInterval(() => setRetryIn((n) => (n <= 1 ? 5 : n - 1)), 1000);
    return () => clearInterval(t);
  }, [error]);

  const updateParams = (patch: Partial<CarryParams>) => {
    setParams((prev) => {
      const next = { ...prev, ...patch };
      saveParams(next);
      return next;
    });
  };

  const feePts = feeDrag(params.feesRtBps, 30);
  const ago = secondsAgo(data?.as_of);

  const filtered = useMemo(() => {
    let rows = data?.markets ?? [];
    if (typeFilter !== "all") {
      rows = rows.filter((m) => m.ref_type === typeFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (m) =>
          m.ticker.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          m.coin.toLowerCase().includes(q),
      );
    }
    return rows.map((m) => {
      const aprH = aprForHorizon(m, params.horizon);
      const net = netCarry(aprH, params.borrowPct, params.feesRtBps, 30);
      return { ...m, net };
    });
  }, [data, search, typeFilter, params]);

  const richestLive = useMemo(() => {
    if (!filtered.length) return data?.summary.richest ?? null;
    const top = [...filtered].sort((a, b) => b.net - a.net)[0];
    return { coin: top.coin, net_carry: top.net };
  }, [filtered, data]);

  return (
    <>
      <header className="fade flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-disp text-[26px] font-bold tracking-[-0.01em]">
            Carry<em className="not-italic text-[var(--gold)]">Scan</em>
          </div>
          <div className="font-mono mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">
            HIP-3 funding &amp; basis · equity perps that never sleep
          </div>
        </div>
        <nav className="font-mono flex gap-5 text-[12.5px]" aria-label="Site">
          <a className="text-[var(--muted)] no-underline border-b border-transparent pb-0.5 hover:text-[var(--text)] hover:border-[var(--gold)]" href="#">
            Methodology
          </a>
          <a className="text-[var(--muted)] no-underline border-b border-transparent pb-0.5 hover:text-[var(--text)] hover:border-[var(--gold)]" href="#">
            Weekly report
          </a>
          <a className="text-[var(--muted)] no-underline border-b border-transparent pb-0.5 hover:text-[var(--text)] hover:border-[var(--gold)]" href="#">
            Alerts ↗
          </a>
        </nav>
      </header>

      <div className="fade d1 font-mono mt-3.5 flex flex-wrap items-center gap-2.5 text-xs text-[var(--muted)]">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            background: data?.stale || error ? "var(--coral)" : "var(--mint)",
            boxShadow: data?.stale || error ? "0 0 8px rgba(239,111,108,.7)" : "0 0 8px rgba(92,214,169,.7)",
          }}
          aria-hidden
        />
        <span>{error ? "error" : data?.stale ? "stale" : "live"}</span>
        <span className="text-[var(--faint)]">/</span>
        <span>dex: xyz</span>
        <span className="text-[var(--faint)]">/</span>
        <span>{data?.markets.length ?? "—"} markets</span>
        <span className="text-[var(--faint)]">/</span>
        <span>
          last tick {ago == null ? "—" : `${ago}s ago`}
        </span>
        <span className="text-[var(--faint)]">/</span>
        <span>funding settles hourly at :00</span>
        <span className="text-[var(--faint)]">/</span>
        <span>{formatStatusTime(now)}</span>
      </div>

      {(error || (!isLoading && !data)) && (
        <p className="fade d1 mt-4 font-sans text-sm text-[var(--coral)]">
          Data feed unreachable. Retrying — nothing you need to do. ({retryIn}s)
        </p>
      )}

      <SummaryStrip
        loading={isLoading && !data}
        richest={richestLive}
        medianApr7d={data?.summary.median_apr_7d ?? null}
        weekendPremium={data?.summary.weekend_premium_pts ?? null}
        totalOi={data?.summary.total_oi_usd ?? null}
        marketCount={data?.markets.length ?? 0}
      />

      <Controls
        search={search}
        onSearch={setSearch}
        typeFilter={typeFilter}
        onTypeFilter={setTypeFilter}
        params={params}
        onParams={updateParams}
      />

      <MarketsTable
        rows={filtered}
        loading={isLoading && !data}
        horizon={params.horizon}
        borrowPct={params.borrowPct}
        feePts={feePts}
      />

      <footer className="fade d3 font-mono mt-6 flex flex-wrap justify-between gap-4 text-[11.5px] text-[var(--faint)]">
        <span>funding: Hyperliquid · cash closes: Massive · basis vs last 16:00 ET close</span>
        <span>research tool — not investment advice</span>
      </footer>
    </>
  );
}
