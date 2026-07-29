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
      <header className="topbar fade">
        <div className="mark">
          <span className="brand">
            Carry<em>Scan</em>
          </span>
          <span>HIP-3 · xyz</span>
        </div>
        <nav aria-label="Site" style={{ display: "flex", gap: 20 }}>
          <a href="#">Methodology</a>
          <a href="#">Weekly report</a>
          <a href="#">Alerts</a>
        </nav>
      </header>

      <h1 className="page-title fade d1">Funding &amp; basis</h1>
      <p className="page-dek fade d1">
        Net carry on Hyperliquid HIP-3 equity and index perps — short the perp, long the cash,
        bank the funding while the cash market sleeps.
      </p>

      <div className="status-row fade d1">
        <span
          className="dot"
          style={{
            background: data?.stale || error ? "var(--down)" : "var(--up)",
          }}
          aria-hidden
        />
        <span>{error ? "error" : data?.stale ? "stale" : data?.live_mode ? "live · hl direct" : "live"}</span>
        <span>/</span>
        <span>dex: xyz</span>
        <span>/</span>
        <span>{data?.markets.length ?? "—"} markets</span>
        <span>/</span>
        <span>last tick {ago == null ? "—" : `${ago}s ago`}</span>
        <span>/</span>
        <span>{formatStatusTime(now)}</span>
      </div>

      {(error || (!isLoading && !data)) && (
        <p className="fade d1" style={{ marginTop: 16, color: "var(--down)", fontSize: 14 }}>
          Data feed unreachable. Retrying — nothing you need to do. ({retryIn}s)
        </p>
      )}

      <div className="fade d2" style={{ marginTop: 28 }}>
        <SummaryStrip
          loading={isLoading && !data}
          richest={richestLive}
          medianApr7d={data?.summary.median_apr_7d ?? null}
          weekendPremium={data?.summary.weekend_premium_pts ?? null}
          totalOi={data?.summary.total_oi_usd ?? null}
          marketCount={data?.markets.length ?? 0}
        />
      </div>

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

      <footer className="site-footer fade d3">
        <span>funding: Hyperliquid · cash closes: Massive · basis vs last 16:00 ET close</span>
        <span>research tool — not investment advice</span>
      </footer>
    </>
  );
}
