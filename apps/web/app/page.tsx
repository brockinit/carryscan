"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  loadBorrowOverrides,
  saveBorrowOverrides,
} from "@/lib/borrow";
import { downloadCsv, toCsv } from "@/lib/exportCsv";
import { formatStatusTime, secondsAgo } from "@/lib/format";
import { SummaryStrip } from "@/components/SummaryStrip";
import { Controls } from "@/components/Controls";
import { MarketsTable } from "@/components/MarketsTable";
import { ModeTabs, type DashMode } from "@/components/ModeTabs";
import { RadarSummary } from "@/components/RadarSummary";
import { RadarTable } from "@/components/RadarTable";
import { SiteNav } from "@/components/SiteNav";
import { RiskStrip } from "@/components/RiskStrip";

const MODE_KEY = "carryscan.mode.v1";

const fetcher = (url: string) =>
  fetch(url).then(async (r) => {
    if (!r.ok) throw new Error("unreachable");
    return r.json();
  });

function loadMode(): DashMode {
  if (typeof window === "undefined") return "carry";
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === "radar" ? "radar" : "carry";
  } catch {
    return "carry";
  }
}

export default function DashboardPage() {
  const { data, error, isLoading } = useSWR<MarketsResponse>("/api/markets", fetcher, {
    refreshInterval: 30000,
  });

  const [mode, setMode] = useState<DashMode>("carry");
  const [params, setParams] = useState<CarryParams>(DEFAULT_PARAMS);
  const [borrowMap, setBorrowMap] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "stock" | "etf_proxy">("all");
  const [dexFilter, setDexFilter] = useState<string>("all");
  const [retryIn, setRetryIn] = useState(5);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setParams(loadParams());
    setMode(loadMode());
    setBorrowMap(loadBorrowOverrides());
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

  const updateMode = (m: DashMode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
  };

  const updateParams = (patch: Partial<CarryParams>) => {
    setParams((prev) => {
      const next = { ...prev, ...patch };
      saveParams(next);
      return next;
    });
  };

  const onBorrowChange = useCallback((ticker: string, pct: number) => {
    setBorrowMap((prev) => {
      const next = {
        ...prev,
        [ticker.toUpperCase()]: Math.min(80, Math.max(0, pct)),
      };
      saveBorrowOverrides(next);
      return next;
    });
  }, []);

  const feePts = feeDrag(params.feesRtBps, 30);
  const ago = secondsAgo(data?.as_of);

  const dexOptions = useMemo(() => {
    const set = new Set((data?.markets ?? []).map((m) => m.dex || "xyz"));
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(() => {
    let rows = data?.markets ?? [];
    if (typeFilter !== "all") {
      rows = rows.filter((m) => m.ref_type === typeFilter);
    }
    if (dexFilter !== "all") {
      rows = rows.filter((m) => m.dex === dexFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (m) =>
          m.ticker.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          m.coin.toLowerCase().includes(q) ||
          m.dex.toLowerCase().includes(q),
      );
    }
    return rows.map((m) => {
      const tick = m.ticker.toUpperCase();
      const borrow =
        borrowMap[tick] ?? m.borrow_default_pct ?? params.borrowPct;
      const aprH = aprForHorizon(m, params.horizon);
      const net = netCarry(aprH, borrow, params.feesRtBps, 30);
      return { ...m, borrow, net };
    });
  }, [data, search, typeFilter, dexFilter, params, borrowMap]);

  const richestLive = useMemo(() => {
    if (!filtered.length) return data?.summary.richest ?? null;
    const top = [...filtered].sort((a, b) => b.net - a.net)[0];
    return { coin: top.coin, net_carry: top.net };
  }, [filtered, data]);

  const radarFiltered = useMemo(() => {
    return filtered.filter((m) => m.positioning);
  }, [filtered]);

  const exportCsv = () => {
    const csv = toCsv(
      filtered.map((m) => ({
        coin: m.coin,
        dex: m.dex,
        ticker: m.ticker,
        mark: m.mark,
        basis_pct: m.basis_pct,
        basis_oracle: m.basis_term?.oracle,
        basis_nbbo: m.basis_term?.nbbo,
        basis_vwap: m.basis_term?.vwap,
        apr_now: m.apr_now,
        apr_1d: m.apr_1d,
        apr_7d: m.apr_7d,
        apr_30d: m.apr_30d,
        apr_p25: m.funding_dist.apr_p25,
        apr_p50: m.funding_dist.apr_p50,
        apr_p75: m.funding_dist.apr_p75,
        borrow_pct: m.borrow,
        borrow_source: m.borrow_source,
        net_carry: m.net,
        capacity_score: m.capacity.score,
        capacity_label: m.capacity.label,
        clip_usd: m.capacity.clip_usd,
        oi_usd: m.oi_usd,
        max_leverage: m.max_leverage,
        crowd_score: m.positioning?.crowd_score,
        regime: m.positioning?.regime,
        stress_ratio: m.stress?.stress_ratio,
      })),
    );
    const day = new Date().toISOString().slice(0, 10);
    downloadCsv(`carryscan-${mode}-${day}.csv`, csv);
  };

  return (
    <>
      <SiteNav />

      <ModeTabs mode={mode} onMode={updateMode} />

      <h1 className="page-title fade d1">
        {mode === "carry" ? "Funding & basis" : "Positioning radar"}
      </h1>
      <p className="page-dek fade d1">
        {mode === "carry"
          ? "Net carry on Hyperliquid HIP-3 equity and index perps — short the perp, long the cash, with per-name borrow, capacity, and trailing distribution so spikes ≠ coupons."
          : "Where leverage is crowded on HIP-3 — funding z-score, acute spikes vs trailing, and basis. A positioning sensor, not a price forecast."}
      </p>

      <div className="status-row fade d1">
        <span
          className="dot"
          style={{
            background: data?.stale || error ? "var(--down)" : "var(--up)",
          }}
          aria-hidden
        />
        <span>
          {error
            ? "error"
            : data?.stale
              ? "stale"
              : data?.live_mode
                ? "live · hl direct"
                : "db"}
        </span>
        <span>/</span>
        <span>mode: {mode === "carry" ? "carry" : "radar"}</span>
        <span>/</span>
        <span>HIP-3 dexs: {data?.summary.dex_count ?? "—"}</span>
        <span>/</span>
        <span>{data?.markets.length ?? "—"} markets</span>
        <span>/</span>
        <span>last tick {ago == null ? "—" : `${ago}s ago`}</span>
        <span>/</span>
        <span>{formatStatusTime(now)}</span>
        <button type="button" className="linkish" onClick={exportCsv} disabled={!filtered.length}>
          Export CSV
        </button>
      </div>

      {(error || (!isLoading && !data)) && (
        <p className="fade d1" style={{ marginTop: 16, color: "var(--down)", fontSize: 14 }}>
          Data feed unreachable. Retrying — nothing you need to do. ({retryIn}s)
        </p>
      )}

      <RiskStrip />

      <div className="fade d2" style={{ marginTop: 28 }}>
        {mode === "carry" ? (
          <SummaryStrip
            loading={isLoading && !data}
            richest={richestLive}
            medianApr7d={data?.summary.median_apr_7d ?? null}
            weekendPremium={data?.summary.weekend_premium_pts ?? null}
            totalOi={data?.summary.total_oi_usd ?? null}
            marketCount={data?.markets.length ?? 0}
            dexCount={data?.summary.dex_count ?? null}
          />
        ) : (
          <RadarSummary
            loading={isLoading && !data}
            summary={data?.positioning_summary}
            marketCount={data?.markets.length ?? 0}
          />
        )}
      </div>

      {mode === "carry" ? (
        <Controls
          search={search}
          onSearch={setSearch}
          typeFilter={typeFilter}
          onTypeFilter={setTypeFilter}
          dexFilter={dexFilter}
          onDexFilter={setDexFilter}
          dexOptions={dexOptions}
          params={params}
          onParams={updateParams}
        />
      ) : (
        <div className="controls fade d2">
          <input
            className="search"
            type="search"
            placeholder="Filter tickers…"
            aria-label="Filter tickers"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="pills" role="group" aria-label="Market type">
            {(
              [
                ["all", "All"],
                ["stock", "Stocks"],
                ["etf_proxy", "Indices"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="pill"
                aria-pressed={typeFilter === id}
                onClick={() => setTypeFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {dexOptions.length > 1 && (
            <div className="pills" role="group" aria-label="Dex">
              <button
                type="button"
                className="pill"
                aria-pressed={dexFilter === "all"}
                onClick={() => setDexFilter("all")}
              >
                All dexs
              </button>
              {dexOptions.map((d) => (
                <button
                  key={d}
                  type="button"
                  className="pill"
                  aria-pressed={dexFilter === d}
                  onClick={() => setDexFilter(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === "carry" ? (
        <MarketsTable
          rows={filtered}
          loading={isLoading && !data}
          horizon={params.horizon}
          feePts={feePts}
          onBorrowChange={onBorrowChange}
        />
      ) : (
        <RadarTable rows={radarFiltered} loading={isLoading && !data} />
      )}

      <footer className="site-footer fade d3">
        <span>
          {mode === "carry"
            ? "funding: Hyperliquid HIP-3 · borrow: IBKR Flex / indicative · capacity from OI"
            : "positioning from HL funding windows · cross-sectional z-scores · research only"}
        </span>
        <span>research tool — not investment advice</span>
      </footer>
    </>
  );
}
