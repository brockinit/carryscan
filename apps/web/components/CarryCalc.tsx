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
    <section className="panel calc" aria-label="Carry calculator">
      <div className="shead">
        <h2>Carry calculator</h2>
      </div>
      <div className="pad">
        <label>
          Notional (USDC)
          <input
            value={notionalStr}
            inputMode="numeric"
            onChange={(e) => {
              const n = Number(e.target.value.replace(/,/g, ""));
              if (!Number.isNaN(n)) setNotional(n);
            }}
          />
        </label>
        <label>
          Hedge borrow APR
          <input
            value={`${borrowPct.toFixed(2)} %`}
            inputMode="decimal"
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
              if (!Number.isNaN(n)) onBorrow(Math.min(50, Math.max(0, n)));
            }}
          />
        </label>
        <label>
          Fees, round trip
          <input
            value={`${feesRtBps} bps`}
            inputMode="numeric"
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
              if (!Number.isNaN(n)) onFees(Math.min(100, Math.max(0, n)));
            }}
          />
        </label>
        <label>
          Horizon
          <input
            value={`${horizon} d`}
            inputMode="numeric"
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^0-9.]/g, ""));
              if (!Number.isNaN(n) && n > 0) setHorizon(n);
            }}
          />
        </label>
        <hr />
        <div className="out">
          <div className="k">Net carry, annualized</div>
          <div className="big">
            {net > 0 ? "+" : ""}
            {fmt(net)}%
          </div>
          <div className="sub">
            ≈{" "}
            <b>${Math.round(perMonth).toLocaleString("en-US")} / month</b> on $
            {(notional / 1000).toFixed(0)}k, hedged
          </div>
          <div className="mathline">
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
