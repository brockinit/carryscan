"use client";

import useSWR from "swr";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import type { WeeklyReport } from "@/lib/weekly";
import { fmt, signedPct } from "@/lib/format";

const fetcher = async (url: string) => {
  const r = await fetch(url);
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || "error");
  return body as WeeklyReport;
};

export default function WeeklyArchivePage({
  params,
}: {
  params: { week: string };
}) {
  const { data: report, error, isLoading } = useSWR<WeeklyReport>(
    `/api/weekly/${params.week}`,
    fetcher,
  );

  return (
    <>
      <SiteNav />
      <div className="crumb fade">
        <Link href="/weekly">← Weekly reports</Link>
      </div>
      <h1 className="page-title fade d1">
        {isLoading ? "…" : report?.headline || `Week of ${params.week}`}
      </h1>
      {error && (
        <p className="page-dek" style={{ color: "var(--down)" }}>
          Report not found.
        </p>
      )}
      {report && (
        <>
          <p className="page-dek fade d1">{report.summary}</p>
          <div className="status-row fade d1">
            <span>week of {report.week_of}</span>
            <span>/</span>
            <span>{report.source}</span>
          </div>
          <ul className="alert-list fade d2">
            {report.findings.map((f, i) => (
              <li key={i} className={`finding ${f.severity}`}>
                <div className="alert-top">
                  <span className="alert-level">{f.severity}</span>
                  <strong>{f.title}</strong>
                </div>
                <p>{f.body}</p>
              </li>
            ))}
          </ul>
          <ol className="rank-list fade d3">
            {report.top_carry.map((m) => (
              <li key={m.coin}>
                <Link href={`/m/${encodeURIComponent(m.coin)}`}>{m.ticker}</Link>
                <span className={m.net_7d >= 0 ? "pos" : "neg"}>
                  {signedPct(m.net_7d)}
                </span>
                <span className="dim">7d {signedPct(m.apr_7d)}</span>
              </li>
            ))}
          </ol>
          <p className="page-dek fade d3" style={{ marginTop: 24 }}>
            Top: {report.top_carry[0]?.ticker ?? "—"} · {report.top_carry[0] ? fmt(report.top_carry[0].net_7d) : "—"}%
            net · {report.weekend_note}
          </p>
        </>
      )}
    </>
  );
}
