"use client";

import Link from "next/link";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { cls, formatMark, formatOiShort, signedPct } from "@/lib/format";
import type { CarryParams } from "@/lib/carry";
import type { Capacity } from "@/lib/capacity";
import type { FundingDist, Stress } from "@/lib/desk";

type Row = {
  coin: string;
  ticker: string;
  name: string;
  dex: string;
  ref_type: string;
  mark: number;
  basis_pct: number | null;
  basis_term?: {
    cash_close: number | null;
    oracle: number | null;
    nbbo: number | null;
    vwap: number | null;
  };
  apr_now: number;
  apr_1d: number;
  apr_7d: number;
  apr_30d: number;
  oi_usd: number;
  spark: number[];
  net: number;
  borrow: number;
  borrow_source?: string;
  funding_dist: FundingDist;
  capacity: Capacity;
  stress: Stress | null;
  max_leverage?: number | null;
};

const col = createColumnHelper<Row>();

function Spark({ a }: { a: number[] }) {
  if (!a.length) return null;
  const w = 110;
  const h = 26;
  const mn = Math.min(...a, 0);
  const mx = Math.max(...a);
  const x = (i: number) => (i / (a.length - 1)) * w;
  const y = (v: number) => h - 3 - ((v - mn) / (mx - mn || 1)) * (h - 6);
  const z = y(0);
  const d = a
    .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="spark" width={110} height={26} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <line className="zero" x1={0} x2={w} y1={z} y2={z} />
      <path d={d} />
    </svg>
  );
}

function Dist({ d }: { d: FundingDist }) {
  return (
    <span className="dist" title="30d hourly APR p25 / p50 / p75">
      <span className={cls(d.apr_p25)}>{d.apr_p25.toFixed(0)}</span>
      <i>/</i>
      <span className={cls(d.apr_p50)}>{d.apr_p50.toFixed(0)}</span>
      <i>/</i>
      <span className={cls(d.apr_p75)}>{d.apr_p75.toFixed(0)}</span>
    </span>
  );
}

type Props = {
  rows: Row[];
  loading: boolean;
  horizon: CarryParams["horizon"];
  feePts: number;
  onBorrowChange: (ticker: string, pct: number) => void;
};

export function MarketsTable({
  rows,
  loading,
  horizon,
  feePts,
  onBorrowChange,
}: Props) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "net", desc: true }]);

  const columns = useMemo(
    () => [
      col.accessor("ticker", {
        id: "market",
        header: "Market",
        cell: (info) => {
          const r = info.row.original;
          return (
            <div className="tick">
              <Link href={`/m/${encodeURIComponent(r.coin)}`}>{r.ticker}</Link>
              {r.ref_type === "etf_proxy" && <span className="tag">INDEX</span>}
              <span className="tag">{r.dex}</span>
              <span className="co">{r.name}</span>
            </div>
          );
        },
        sortingFn: "alphanumeric",
      }),
      col.accessor("mark", {
        header: "Mark",
        cell: (i) => formatMark(i.getValue()),
      }),
      col.accessor((r) => r.basis_pct ?? 0, {
        id: "basis",
        header: "Basis",
        cell: (i) => {
          const r = i.row.original;
          const v = r.basis_pct;
          const t = r.basis_term;
          const tip = t
            ? `close ${t.cash_close ?? "—"} · oracle ${t.oracle ?? "—"} · nbbo ${t.nbbo ?? "—"} · vwap ${t.vwap ?? "—"}`
            : undefined;
          if (v == null) return <span title={tip}>—</span>;
          return (
            <span className={cls(v)} title={tip}>
              {signedPct(v, 2)}
            </span>
          );
        },
      }),
      col.accessor("apr_now", {
        header: "Now",
        cell: (i) => (
          <span className={cls(i.getValue())}>{signedPct(i.getValue())}</span>
        ),
      }),
      col.accessor("apr_7d", {
        header: "7d",
        cell: (i) => (
          <span className={cls(i.getValue())}>{signedPct(i.getValue())}</span>
        ),
      }),
      col.accessor("apr_30d", {
        header: "30d",
        cell: (i) => (
          <span className={cls(i.getValue())}>{signedPct(i.getValue())}</span>
        ),
      }),
      col.accessor((r) => r.funding_dist.apr_p50, {
        id: "dist",
        header: "p25/50/75",
        cell: (i) => <Dist d={i.row.original.funding_dist} />,
      }),
      col.accessor("borrow", {
        header: "Borrow",
        cell: (i) => {
          const r = i.row.original;
          const src = r.borrow_source === "ibkr_flex" ? "ibkr" : r.borrow_source === "csv" ? "csv" : "ind";
          return (
            <span className="borrow-cell">
              <input
                className="borrow-input"
                type="number"
                step="0.1"
                min={0}
                max={80}
                value={r.borrow}
                aria-label={`${r.ticker} borrow APR`}
                onChange={(e) =>
                  onBorrowChange(r.ticker, Number(e.target.value) || 0)
                }
              />
              <small className="dim" title={r.borrow_source || "indicative"}>
                {src}
              </small>
            </span>
          );
        },
      }),
      col.accessor("net", {
        header: `Net ${horizon}`,
        cell: (i) => (
          <span className={`net ${cls(i.getValue())}`}>{signedPct(i.getValue())}</span>
        ),
      }),
      col.accessor((r) => r.capacity.score, {
        id: "cap",
        header: "Capacity",
        cell: (i) => {
          const c = i.row.original.capacity;
          return (
            <span className={`cap cap-${c.label}`} title={`Suggested clip ~$${Math.round(c.clip_usd / 1e3)}K`}>
              {c.score}
              <small>{c.label}</small>
            </span>
          );
        },
      }),
      col.accessor((r) => r.stress?.stress_ratio ?? -1, {
        id: "stress",
        header: "Stress",
        cell: (i) => {
          const s = i.row.original.stress;
          if (!s || s.stress_ratio == null) return <span className="dim">—</span>;
          return (
            <span
              className={s.stress_ratio >= 8 ? "neg" : "dim"}
              title={`p90 MAE ${s.mae_p90}% / fund banked ${s.funding_banked_avg}%`}
            >
              {s.stress_ratio.toFixed(1)}×
            </span>
          );
        },
      }),
      col.accessor("oi_usd", {
        header: "Open int.",
        cell: (i) => <span className="dim">{formatOiShort(i.getValue())}</span>,
      }),
      col.accessor("spark", {
        id: "spark",
        header: "Funding",
        enableSorting: false,
        cell: (i) => <Spark a={i.getValue()} />,
      }),
    ],
    [horizon, onBorrowChange],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const topCoin = rows.length
    ? [...rows].sort((a, b) => b.net - a.net)[0]?.coin
    : null;

  const foot = `Net ${horizon} = trailing funding − per-name borrow − fees (${feePts.toFixed(1)} pts amortized 30d). Borrow badge: ibkr = Flex, csv = blotter, ind = indicative. Basis tooltip = close/oracle/nbbo/vwap. Capacity from OI; stress = weekend p90 MAE / funding banked (DB).`;

  return (
    <div className="tablewrap fade d3">
      <table className="data">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const sorted = h.column.getIsSorted();
                return (
                  <th
                    key={h.id}
                    scope="col"
                    className={sorted ? "sorted" : undefined}
                    style={{ cursor: h.column.getCanSort() ? "pointer" : "default" }}
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {sorted === "desc" ? " ↓" : sorted === "asc" ? " ↑" : ""}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: columns.length }).map((__, j) => (
                  <td key={j}>
                    <div className="skeleton" style={{ height: 12, width: "100%" }} />
                  </td>
                ))}
              </tr>
            ))}
          {!loading &&
            table.getRowModel().rows.map((row) => {
              const isTop = row.original.coin === topCoin;
              return (
                <tr key={row.id} className={isTop ? "top" : undefined}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={columns.length}>
              {foot}
              {rows.some((r) => r.ref_type === "etf_proxy") && (
                <> Index basis uses an ETF proxy (QQQ for XYZ100), not an exact cash index.</>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
