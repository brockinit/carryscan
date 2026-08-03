"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { SiteNav } from "@/components/SiteNav";
import type { MarketsResponse } from "@/lib/types";
import { feeDrag, netCarry } from "@/lib/carry";
import {
  borrowFor,
  loadBorrowOverrides,
} from "@/lib/borrow";
import { fmt, formatOiShort, signedPct } from "@/lib/format";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const BASKET_KEY = "carryscan.basket.v1";

type Leg = { coin: string; notional: number };

export default function BasketPage() {
  const { data, isLoading } = useSWR<MarketsResponse>("/api/markets", fetcher, {
    refreshInterval: 30000,
  });
  const [legs, setLegs] = useState<Leg[]>([]);
  const [borrowMap, setBorrowMap] = useState<Record<string, number>>({});
  const fees = 10;

  useEffect(() => {
    setBorrowMap(loadBorrowOverrides());
    try {
      const raw = localStorage.getItem(BASKET_KEY);
      if (raw) setLegs(JSON.parse(raw) as Leg[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(BASKET_KEY, JSON.stringify(legs));
  }, [legs]);

  const byCoin = useMemo(() => {
    const m = new Map(data?.markets.map((x) => [x.coin, x]) ?? []);
    return m;
  }, [data]);

  const toggle = (coin: string) => {
    setLegs((prev) => {
      if (prev.some((l) => l.coin === coin)) {
        return prev.filter((l) => l.coin !== coin);
      }
      return [...prev, { coin, notional: 1_000_000 }];
    });
  };

  const setNotional = (coin: string, notional: number) => {
    setLegs((prev) =>
      prev.map((l) => (l.coin === coin ? { ...l, notional } : l)),
    );
  };

  const book = useMemo(() => {
    return legs
      .map((l) => {
        const m = byCoin.get(l.coin);
        if (!m) return null;
        const borrow = borrowFor(m.ticker, borrowMap, m.borrow_default_pct);
        const net = netCarry(m.apr_7d, borrow, fees, 30);
        return { ...m, notional: l.notional, borrow, net };
      })
      .filter(Boolean) as Array<
      NonNullable<ReturnType<typeof byCoin.get>> & {
        notional: number;
        borrow: number;
        net: number;
      }
    >;
  }, [legs, byCoin, borrowMap]);

  const totalN = book.reduce((s, b) => s + b.notional, 0);
  const wNet =
    totalN > 0
      ? book.reduce((s, b) => s + b.net * b.notional, 0) / totalN
      : 0;
  const feePts = feeDrag(fees, 30);
  const index = byCoin.get("xyz:XYZ100");
  const vsIndex = index
    ? wNet - netCarry(index.apr_7d, borrowFor("XYZ100", borrowMap, 0.5), fees, 30)
    : null;

  return (
    <>
      <SiteNav />
      <h1 className="page-title fade d1">Basket builder</h1>
      <p className="page-dek fade d1">
        Pick legs, set notionals, see weighted net carry after per-name borrow. β to XYZ100 is
        carry-spread vs the index sleeve — not equity beta.
      </p>

      <section className="strip fade d2" style={{ marginTop: 28 }}>
        <div className="cell">
          <div className="k">Weighted net 7d</div>
          <div className={`v ${wNet >= 0 ? "up" : ""}`}>{fmt(wNet)}%</div>
        </div>
        <div className="cell">
          <div className="k">Gross notional</div>
          <div className="v">{formatOiShort(totalN)}</div>
        </div>
        <div className="cell">
          <div className="k">Legs</div>
          <div className="v">{book.length}</div>
        </div>
        <div className="cell">
          <div className="k">vs XYZ100 carry</div>
          <div className="v">
            {vsIndex == null ? "—" : signedPct(vsIndex)}
            <small>spread</small>
          </div>
        </div>
      </section>

      <div className="basket-grid fade d2">
        <div>
          <h2 className="section-h">Universe</h2>
          <ul className="basket-universe">
            {(data?.markets ?? []).map((m) => {
              const on = legs.some((l) => l.coin === m.coin);
              return (
                <li key={m.coin}>
                  <button
                    type="button"
                    className="pill"
                    aria-pressed={on}
                    onClick={() => toggle(m.coin)}
                  >
                    {m.ticker}
                  </button>
                  <span className="dim">{m.capacity.label}</span>
                </li>
              );
            })}
            {isLoading && <li className="dim">Loading…</li>}
          </ul>
        </div>
        <div>
          <h2 className="section-h">Book</h2>
          {!book.length && <p className="dim">Select tickers to build a sleeve.</p>}
          <table className="data basket-table">
            <thead>
              <tr>
                <th>Leg</th>
                <th>Notional</th>
                <th>7d</th>
                <th>Borrow</th>
                <th>Net</th>
                <th>Clip</th>
              </tr>
            </thead>
            <tbody>
              {book.map((b) => (
                <tr key={b.coin}>
                  <td>{b.ticker}</td>
                  <td>
                    <input
                      className="borrow-input"
                      style={{ width: 96 }}
                      type="number"
                      step={100000}
                      value={b.notional}
                      onChange={(e) =>
                        setNotional(b.coin, Number(e.target.value) || 0)
                      }
                    />
                  </td>
                  <td>{signedPct(b.apr_7d)}</td>
                  <td>{fmt(b.borrow)}%</td>
                  <td className={b.net >= 0 ? "pos" : "neg"}>{signedPct(b.net)}</td>
                  <td className="dim">{formatOiShort(b.capacity.clip_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="dim" style={{ marginTop: 12, fontSize: 12 }}>
            Fees {fees} bps r/t → {fmt(feePts)} pts drag. Notionals persist locally.
          </p>
        </div>
      </div>
    </>
  );
}
