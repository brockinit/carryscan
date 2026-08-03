"use client";

import useSWR from "swr";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import type { WeeklyReport } from "@/lib/weekly";
import { fmt, signedPct } from "@/lib/format";

type IndexPayload = {
  dates: string[];
  latest: WeeklyReport | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function severityClass(s: WeeklyFindingSeverity) {
  if (s === "high") return "finding high";
  if (s === "notable") return "finding notable";
  return "finding info";
}

type WeeklyFindingSeverity = WeeklyReport["findings"][number]["severity"];

export default function WeeklyPage() {
  const { data, isLoading } = useSWR<IndexPayload>("/api/weekly", fetcher, {
    refreshInterval: 60_000,
  });
  const report = data?.latest;
  const dates = data?.dates ?? [];

  return (
    <>
      <SiteNav />
      <h1 className="page-title fade d1">Weekly report</h1>
      <p className="page-dek fade d1">
        Sunday carry &amp; positioning scorecard — published into the app by the
        weekly automation after the weekend funding window.
      </p>

      <div className="status-row fade d1">
        <span>{isLoading ? "loading…" : report ? `week of ${report.week_of}` : "no reports yet"}</span>
        {report && (
          <>
            <span>/</span>
            <span>{report.source}</span>
            <span>/</span>
            <span>as of {report.as_of ? new Date(report.as_of).toLocaleString() : "—"}</span>
          </>
        )}
      </div>

      {!isLoading && !report && (
        <p className="page-dek fade d2" style={{ marginTop: 28 }}>
          No published report yet. The Sunday automation writes a JSON scorecard
          under <code className="font-mono">content/weekly/</code> and deploys
          via git push.
        </p>
      )}

      {report && (
        <>
          <h2 className="section-h fade d2">{report.headline}</h2>
          <p className="page-dek fade d2" style={{ marginTop: 8 }}>
            {report.summary}
          </p>

          <section className="strip fade d2" style={{ marginTop: 28 }} aria-label="Week scorecard">
            <div className="cell">
              <div className="k">Top net (7d)</div>
              <div className="v amber">
                {report.top_carry[0]
                  ? `${report.top_carry[0].ticker} · ${fmt(report.top_carry[0].net_7d)}%`
                  : "—"}
              </div>
            </div>
            <div className="cell">
              <div className="k">Findings</div>
              <div className="v">{report.findings.length}</div>
            </div>
            <div className="cell">
              <div className="k">Acute / long / short</div>
              <div className="v">
                {report.regimes.acute.length} / {report.regimes.long_crowded.length} /{" "}
                {report.regimes.short_crowded.length}
              </div>
            </div>
            <div className="cell">
              <div className="k">Weekend</div>
              <div className="v" style={{ fontSize: "0.95rem", lineHeight: 1.35 }}>
                {report.weekend_note.slice(0, 80)}
                {report.weekend_note.length > 80 ? "…" : ""}
              </div>
            </div>
          </section>

          <h2 className="section-h fade d2">Findings</h2>
          <ul className="alert-list fade d2">
            {report.findings.map((f, i) => (
              <li key={i} className={severityClass(f.severity)}>
                <div className="alert-top">
                  <span className="alert-level">{f.severity}</span>
                  <strong>{f.title}</strong>
                  <span className="dim">{f.theme}</span>
                  {f.tickers?.map((t) => (
                    <Link key={t} href={`/m/${encodeURIComponent(t.includes(":") ? t : `xyz:${t}`)}`}>
                      {t.includes(":") ? t.split(":")[1] : t}
                    </Link>
                  ))}
                </div>
                <p>{f.body}</p>
              </li>
            ))}
          </ul>

          <h2 className="section-h fade d3">Top net carry</h2>
          <ol className="rank-list fade d3">
            {report.top_carry.map((m) => (
              <li key={m.coin}>
                <Link href={`/m/${encodeURIComponent(m.coin)}`}>{m.ticker}</Link>
                <span className={m.net_7d >= 0 ? "pos" : "neg"}>
                  {signedPct(m.net_7d)}
                </span>
                <span className="dim">
                  7d {signedPct(m.apr_7d)}
                  {m.note ? ` · ${m.note}` : ""}
                </span>
              </li>
            ))}
          </ol>

          <h2 className="section-h fade d3">Regime board</h2>
          <div className="regime-board fade d3">
            <div>
              <h3>Acute</h3>
              <p>{report.regimes.acute.join(", ") || "—"}</p>
            </div>
            <div>
              <h3>Long crowded</h3>
              <p>{report.regimes.long_crowded.join(", ") || "—"}</p>
            </div>
            <div>
              <h3>Short crowded</h3>
              <p>{report.regimes.short_crowded.join(", ") || "—"}</p>
            </div>
          </div>

          <p className="page-dek fade d3" style={{ marginTop: 28 }}>
            {report.weekend_note}
          </p>
        </>
      )}

      {dates.length > 1 && (
        <>
          <h2 className="section-h fade d3">Archive</h2>
          <ul className="rank-list fade d3">
            {dates.map((d) => (
              <li key={d}>
                <Link href={`/weekly/${d}`}>{d}</Link>
                <span className="dim">{d === report?.week_of ? "latest" : ""}</span>
                <span />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
