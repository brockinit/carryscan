"use client";

import { useEffect, useRef, useState } from "react";
import type { CarryParams } from "@/lib/carry";

type Props = {
  search: string;
  onSearch: (v: string) => void;
  typeFilter: "all" | "stock" | "etf_proxy";
  onTypeFilter: (v: "all" | "stock" | "etf_proxy") => void;
  dexFilter: string;
  onDexFilter: (v: string) => void;
  dexOptions: string[];
  params: CarryParams;
  onParams: (patch: Partial<CarryParams>) => void;
};

export function Controls({
  search,
  onSearch,
  typeFilter,
  onTypeFilter,
  dexFilter,
  onDexFilter,
  dexOptions,
  params,
  onParams,
}: Props) {
  const [borrowStr, setBorrowStr] = useState(params.borrowPct.toFixed(2));
  const [feesStr, setFeesStr] = useState(String(params.feesRtBps));
  const onParamsRef = useRef(onParams);
  onParamsRef.current = onParams;

  useEffect(() => {
    setBorrowStr(params.borrowPct.toFixed(2));
    setFeesStr(String(params.feesRtBps));
  }, [params.borrowPct, params.feesRtBps]);

  useEffect(() => {
    const t = setTimeout(() => {
      const n = Number(borrowStr);
      if (Number.isNaN(n)) return;
      onParamsRef.current({ borrowPct: Math.min(50, Math.max(0, n)) });
    }, 150);
    return () => clearTimeout(t);
  }, [borrowStr]);

  useEffect(() => {
    const t = setTimeout(() => {
      const n = Number(feesStr);
      if (Number.isNaN(n)) return;
      onParamsRef.current({ feesRtBps: Math.min(100, Math.max(0, n)) });
    }, 150);
    return () => clearTimeout(t);
  }, [feesStr]);

  return (
    <div className="controls fade d2">
      <input
        className="search"
        type="search"
        placeholder="Filter tickers…"
        aria-label="Filter tickers"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
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
            onClick={() => onTypeFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {dexOptions.length > 0 && (
        <div className="pills" role="group" aria-label="HIP-3 dex">
          <button
            type="button"
            className="pill"
            aria-pressed={dexFilter === "all"}
            onClick={() => onDexFilter("all")}
          >
            All dexs
          </button>
          {dexOptions.map((d) => (
            <button
              key={d}
              type="button"
              className="pill"
              aria-pressed={dexFilter === d}
              onClick={() => onDexFilter(d)}
            >
              {d}
            </button>
          ))}
        </div>
      )}
      <label className="param">
        horizon
        <span className="pills">
          {(["1d", "7d", "30d"] as const).map((h) => (
            <button
              key={h}
              type="button"
              className="pill"
              aria-pressed={params.horizon === h}
              onClick={() => onParams({ horizon: h })}
            >
              {h}
            </button>
          ))}
        </span>
      </label>
      <label className="param">
        <abbr title="Fallback borrow APR when a name has no IBKR/CSV/indicative default or override">
          fallback borrow
        </abbr>
        <input
          value={borrowStr}
          inputMode="decimal"
          aria-label="Hedge borrow APR percent"
          onChange={(e) => setBorrowStr(e.target.value)}
        />{" "}
        %
      </label>
      <label className="param">
        <abbr title="Round-trip perp fees, amortized over 30d">fees r/t</abbr>
        <input
          value={feesStr}
          inputMode="numeric"
          aria-label="Round trip fees in basis points"
          onChange={(e) => setFeesStr(e.target.value)}
        />{" "}
        bps
      </label>
    </div>
  );
}
