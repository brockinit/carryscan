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

type Row = {
  coin: string;
  ticker: string;
  name: string;
  ref_type: string;
  mark: number;
  basis_pct: number | null;
  apr_now: number;
  apr_1d: number;
  apr_7d: number;
  apr_30d: number;
  oi_usd: number;
  spark: number[];
  net: number;
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

type Props = {
  rows: Row[];
  loading: boolean;
  horizon: CarryParams["horizon"];
  borrowPct: number;
  feePts: number;
};

export function MarketsTable({ rows, loading, horizon, borrowPct, feePts }: Props) {
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
          const v = i.row.original.basis_pct;
          if (v == null) return "—";
          return <span className={cls(v)}>{signedPct(v, 2)}</span>;
        },
      }),
      col.accessor("apr_now", {
        header: "Funding now",
        cell: (i) => (
          <span className={cls(i.getValue())}>{signedPct(i.getValue())}</span>
        ),
      }),
      col.accessor("apr_7d", {
        header: "7d APR",
        cell: (i) => (
          <span className={cls(i.getValue())}>{signedPct(i.getValue())}</span>
        ),
      }),
      col.accessor("apr_30d", {
        header: "30d APR",
        cell: (i) => (
          <span className={cls(i.getValue())}>{signedPct(i.getValue())}</span>
        ),
      }),
      col.accessor("apr_1d", {
        header: "1d APR",
        cell: (i) => (
          <span className={cls(i.getValue())}>{signedPct(i.getValue())}</span>
        ),
      }),
      col.accessor("net", {
        header: "Net carry",
        cell: (i) => (
          <span className={`net ${cls(i.getValue())}`}>{signedPct(i.getValue())}</span>
        ),
      }),
      col.accessor("oi_usd", {
        header: "Open int.",
        cell: (i) => <span className="dim">{formatOiShort(i.getValue())}</span>,
      }),
      col.accessor("spark", {
        id: "spark",
        header: "7d funding",
        enableSorting: false,
        cell: (i) => <Spark a={i.getValue()} />,
      }),
    ],
    [],
  );

  const visible = columns.filter((c) => {
    const id = c.id || ("accessorKey" in c ? String(c.accessorKey) : "");
    if (horizon === "1d") return id !== "apr_7d";
    if (id === "apr_1d") return false;
    return true;
  });

  const table = useReactTable({
    data: rows,
    columns: visible,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const topCoin = rows.length
    ? [...rows].sort((a, b) => b.net - a.net)[0]?.coin
    : null;

  const foot = `Net carry = ${horizon} realized funding − hedge borrow (${borrowPct.toFixed(2)}%) − fees (${feePts.toFixed(1)} pts amortized 30d). Short-perp, long-cash construction. Assumptions are yours to edit above.`;

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
                {Array.from({ length: visible.length }).map((__, j) => (
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
            <td colSpan={visible.length}>
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
