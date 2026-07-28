"use client";

import { useEffect, useRef, useState } from "react";
import type { CarryParams } from "@/lib/carry";

type Props = {
  search: string;
  onSearch: (v: string) => void;
  typeFilter: "all" | "stock" | "etf_proxy";
  onTypeFilter: (v: "all" | "stock" | "etf_proxy") => void;
  params: CarryParams;
  onParams: (patch: Partial<CarryParams>) => void;
};

export function Controls({
  search,
  onSearch,
  typeFilter,
  onTypeFilter,
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

  const pill = (active: boolean) =>
    `px-3.5 py-[7px] border-0 font-inherit cursor-pointer ${
      active
        ? "bg-[var(--panel-2)] text-[var(--gold-hi)]"
        : "bg-[var(--panel)] text-[var(--muted)]"
    }`;

  return (
    <div className="fade d2 font-mono mb-3.5 flex flex-wrap items-center gap-x-[18px] gap-y-2.5 text-[12.5px]">
      <input
        className="w-[180px] rounded-[2px] border border-[var(--line)] bg-[var(--panel)] px-3 py-[7px] text-[var(--text)] placeholder:text-[var(--faint)]"
        type="search"
        placeholder="Filter tickers…"
        aria-label="Filter tickers"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
      />
      <div className="flex overflow-hidden rounded-[2px] border border-[var(--line)]" role="group" aria-label="Market type">
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
            className={pill(typeFilter === id)}
            aria-pressed={typeFilter === id}
            onClick={() => onTypeFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-[var(--muted)]">
        horizon
        <span className="flex overflow-hidden rounded-[2px] border border-[var(--line)]">
          {(["1d", "7d", "30d"] as const).map((h) => (
            <button
              key={h}
              type="button"
              className={pill(params.horizon === h)}
              aria-pressed={params.horizon === h}
              onClick={() => onParams({ horizon: h })}
            >
              {h}
            </button>
          ))}
        </span>
      </label>
      <label className="flex items-center gap-2 text-[var(--muted)]">
        <abbr
          title="Annualized cost of capital on your hedge leg"
          className="no-underline border-b border-dotted border-[var(--faint)] cursor-help"
        >
          hedge borrow
        </abbr>
        <input
          className="w-16 rounded-[2px] border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-right text-[var(--gold-hi)]"
          value={borrowStr}
          inputMode="decimal"
          aria-label="Hedge borrow APR percent"
          onChange={(e) => setBorrowStr(e.target.value)}
        />{" "}
        %
      </label>
      <label className="flex items-center gap-2 text-[var(--muted)]">
        <abbr
          title="Round-trip perp fees, amortized over 30d"
          className="no-underline border-b border-dotted border-[var(--faint)] cursor-help"
        >
          fees r/t
        </abbr>
        <input
          className="w-16 rounded-[2px] border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-right text-[var(--gold-hi)]"
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
