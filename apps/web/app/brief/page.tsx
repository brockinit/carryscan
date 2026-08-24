"use client";

import { useState } from "react";
import useSWR from "swr";
import { SiteNav } from "@/components/SiteNav";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function BriefPage() {
  const { data, mutate, isLoading } = useSWR("/api/trader/brief", fetcher);
  const [busy, setBusy] = useState<string | null>(null);
  const brief = data?.brief;
  const payload = brief?.payload;

  async function run(kind: "preopen" | "postclose") {
    setBusy(kind);
    try {
      await fetch(`/api/trader/brief/${kind}`, { method: "POST" });
      await mutate();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <SiteNav />
      <h1 className="page-title fade d1">Session brief</h1>
      <p className="page-dek fade d1">
        Pre-open and post-close packets: character, structure magnets, apply/avoid, taught
        behaviors. Targets are not forecasts.
      </p>
      <div className="status-row fade d1">
        <span>{isLoading ? "loading…" : brief ? `${brief.kind} ${brief.as_of}` : "none yet"}</span>
        <button className="trader-btn" disabled={!!busy} onClick={() => void run("preopen")}>
          {busy === "preopen" ? "…" : "run pre-open"}
        </button>
        <button className="trader-btn" disabled={!!busy} onClick={() => void run("postclose")}>
          {busy === "postclose" ? "…" : "run post-close"}
        </button>
      </div>
      {payload && (
        <div className="trader-grid fade d2">
          <section className="trader-card">
            <h2>Narrative</h2>
            <p style={{ whiteSpace: "pre-wrap" }}>{payload.narrative || "—"}</p>
          </section>
          <section className="trader-card">
            <h2>Character / apply-avoid</h2>
            <pre>{JSON.stringify(payload.character, null, 2)}</pre>
          </section>
          <section className="trader-card">
            <h2>Magnets</h2>
            <pre>{JSON.stringify(payload.gex, null, 2)}</pre>
          </section>
          <section className="trader-card">
            <h2>Candidates</h2>
            <pre>{JSON.stringify(payload.candidate_trades || payload.matching_behaviors, null, 2)}</pre>
          </section>
        </div>
      )}
    </>
  );
}
