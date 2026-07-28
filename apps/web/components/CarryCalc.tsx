"use client";

import { useMemo, useState } from "react";
import { feeDrag, netCarry } from "@/lib/carry";
import { fmt } from "@/lib/format";

type Props = {
  coin: string;
  ticker: string;
  apr7d: number;
  borrowPct: number;
  feesRtBps: number;
  onBorrow: (n: number) => void;
  onFees: (n: number) => void;
};

export function CarryCalc({
  coin,
  ticker,
  apr7d,
  borrowPct,
  feesRtBps,
  onBorrow,
  onFees,
}: Props) {
  const [notional, setNotional] = useState(100_000);
  const [horizon, setHorizon] = useState(30);

  const feePts = feeDrag(feesRtBps, horizon);
  const net = netCarry(apr7d, borrowPct, feesRtBps, horizon);
  const perMonth = (notional * net) / 100 / 12;

  const notionalStr = useMemo(
    () => notional.toLocaleString("en-US"),
    [notional],
  );

  return (
    <section className="mt-5 border border-[var(--line)] bg-[var(--panel)]" aria-label="Carry calculator">
      <div className="border-b border-[var(--line)] px-[18px] py-3.5">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
          Carry calculator
        </h2>
      </div>
      <div className="p-[18px]">
        <label className="font-mono mb-2.5 flex items-center justify-between gap-2.5 text-[12.5px] text-[var(--muted)]">
          Notional (USDC)
          <input
            className="w-[110px] rounded-[2px] border border-[var(--line)] bg-[var(--panel-2)] px-2.5 py-[7px] text-right text-[var(--text)]"
            value={notionalStr}
            inputMode="numeric"
            onChange={(e) => {
              const n = Number(e.target.value.replace(/,/g, ""));
              if (!Number.isNaN(n)) setNotional(n);
            }}
          />
        </label>
        <label className="font-mono mb-2.5 flex items-center justify-between gap-2.5 text-[12.5px] text-[var(--muted)]">
          Hedge borrow APR
          <input
            className="w-[110px] rounded-[2px] border border-[var(--line)] bg-[var(--panel-2)] px-2.5 py-[7px] text-right text-[var(--text)]"
            value={`${borrowPct.toFixed(2)} %`}
            inputMode="decimal"
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
              if (!Number.isNaN(n)) onBorrow(Math.min(50, Math.max(0, n)));
            }}
          />
        </label>
        <label className="font-mono mb-2.5 flex items-center justify-between gap-2.5 text-[12.5px] text-[var(--muted)]">
          Fees, round trip
          <input
            className="w-[110px] rounded-[2px] border border-[var(--line)] bg-[var(--panel-2)] px-2.5 py-[7px] text-right text-[var(--text)]"
            value={`${feesRtBps} bps`}
            inputMode="numeric"
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
              if (!Number.isNaN(n)) onFees(Math.min(100, Math.max(0, n)));
            }}
          />
        </label>
        <label className="font-mono mb-2.5 flex items-center justify-between gap-2.5 text-[12.5px] text-[var(--muted)]">
          Horizon
          <input
            className="w-[110px] rounded-[2px] border border-[var(--line)] bg-[var(--panel-2)] px-2.5 py-[7px] text-right text-[var(--text)]"
            value={`${horizon} d`}
            inputMode="numeric"
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
              if (!Number.isNaN(n) && n > 0) setHorizon(n);
            }}
          />
        </label>
        <hr className="my-3.5 border-0 border-t border-[var(--line)]" />
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--muted)]">
            Net carry, annualized
          </div>
          <div
            className="font-mono mt-1 text-[34px] font-semibold text-[var(--gold-hi)]"
            style={{ textShadow: "0 0 18px rgba(232,181,77,.3)" }}
          >
            {net > 0 ? "+" : ""}
            {fmt(net)}%
          </div>
          <div className="font-mono mt-1 text-[12.5px] text-[var(--muted)]">
            ≈{" "}
            <b className="font-medium text-[var(--mint)]">
              ${Math.round(perMonth).toLocaleString("en-US")} / month
            </b>{" "}
            on ${(notional / 1000).toFixed(0)}k, hedged
          </div>
          <div className="font-mono mt-3 text-[11px] leading-relaxed text-[var(--faint)]">
            {apr7d > 0 ? "+" : ""}
            {fmt(apr7d)} funding (7d) − {fmt(borrowPct)} borrow − {fmt(feePts)} fees ={" "}
            {net > 0 ? "+" : ""}
            {fmt(net)} APR
            <br />
            construction: short {coin} · long {ticker} cash
          </div>
        </div>
      </div>
    </section>
  );
}
