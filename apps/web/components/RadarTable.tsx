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
import { cls, formatOiShort, signedPct } from "@/lib/format";
import type { Positioning } from "@/lib/positioning";
import type { Capacity } from "@/lib/capacity";

type Row = {
  coin: string;
  ticker: string;
  name: string;
  dex?: string;
  ref_type: string;
  apr_now: number;
  apr_7d: number;
  apr_30d: number;
  basis_pct: number | null;
  oi_usd: number;
  positioning: Positioning;
  capacity?: Capacity;
};

const col = createColumnHelper<Row>();

function regimeClass(regime: Positioning["regime"]): string {
  if (regime === "long_crowded" || regime === "acute_long") return "regime long";
  if (regime === "short_crowded" || regime === "acute_short") return "regime short";
  return "regime bal";
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.abs(score));
  const side = score >= 0 ? "pos" : "neg";
  return (
    <div className="score-bar" title={`${score}`}>
      <div className="score-track">
        <i className="mid" />
        <b className={side} style={{ width: `${pct * 0.5}%` }} />
      </div>
      <span className={cls(score)}>{score > 0 ? "+" : ""}{score.toFixed(0)}</span>
    </div>
  );
}

type Props = {
  rows: Row[];
  loading: boolean;
};

export function RadarTable({ rows, loading }: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "crowd", desc: true },
  ]);

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
              {r.dex && r.dex !== "xyz" && <span className="tag">{r.dex}</span>}
              {r.ref_type === "etf_proxy" && <span className="tag">INDEX</span>}
              <span className="co">{r.name}</span>
            </div>
          );
        },
      }),
      col.accessor((r) => r.positioning.crowd_score, {
        id: "crowd",
        header: "Crowd score",
        cell: (i) => <ScoreBar score={i.getValue()} />,
      }),
      col.accessor((r) => r.positioning.regime_label, {
        id: "regime",
        header: "Regime",
        cell: (i) => {
          const r = i.row.original.positioning;
          return (
            <span className={regimeClass(r.regime)} title={r.note}>
              {r.regime_label}
            </span>
          );
        },
        sortingFn: (a, b) =>
          a.original.positioning.regime.localeCompare(b.original.positioning.regime),
      }),
      col.accessor((r) => r.positioning.spike_pts, {
        id: "spike",
        header: "Spike",
        cell: (i) => {
          const v = i.getValue();
          return <span className={cls(v)}>{signedPct(v, 1)}</span>;
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
      col.accessor((r) => r.basis_pct ?? 0, {
        id: "basis",
        header: "Basis",
        cell: (i) => {
          const v = i.row.original.basis_pct;
          if (v == null) return "—";
          return <span className={cls(v)}>{signedPct(v, 2)}</span>;
        },
      }),
      col.accessor((r) => r.capacity?.score ?? 0, {
        id: "cap",
        header: "Capacity",
        cell: (i) => {
          const c = i.row.original.capacity;
          if (!c) return "—";
          return (
            <span className={`cap cap-${c.label}`}>
              {c.score}
              <small>{c.label}</small>
            </span>
          );
        },
      }),
      col.accessor("oi_usd", {
        header: "Open int.",
        cell: (i) => <span className="dim">{formatOiShort(i.getValue())}</span>,
      }),
      col.accessor((r) => r.positioning.funding_z, {
        id: "fz",
        header: "Fund z",
        cell: (i) => {
          const v = i.getValue();
          return <span className={cls(v)}>{v > 0 ? "+" : ""}{v.toFixed(2)}</span>;
        },
      }),
    ],
    [],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const top = rows.length
    ? [...rows].sort(
        (a, b) =>
          Math.abs(b.positioning.crowd_score) - Math.abs(a.positioning.crowd_score),
      )[0]?.coin
    : null;

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
            table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={row.original.coin === top ? "top" : undefined}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={columns.length}>
              Crowd score blends 7d funding z-score, now−7d spike, and basis z (−100…+100).
              Positive = long overcrowding (shorts receive). Negative = short overcrowding
              (longs receive). Spike = acute vs trailing — not a price forecast. Hover regime
              for the read.
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
