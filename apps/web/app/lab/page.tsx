"use client";

import { useState } from "react";
import { SiteNav } from "@/components/SiteNav";

const SAMPLE = `{
  "id": "crush_demo",
  "title": "short-dated IV crush after earnings",
  "structure": "event_iv_crush",
  "hold_days": 3,
  "universe": "SPY",
  "train_start": "2018-01-01",
  "train_end": "2022-12-31",
  "test_start": "2023-01-01",
  "test_end": "2026-07-01",
  "min_trades": 20,
  "thesis": "IV in DTE<=7 contracts crushes after a major print"
}`;

export default function LabPage() {
  const [spec, setSpec] = useState(SAMPLE);
  const [nl, setNl] = useState("");
  const [result, setResult] = useState<string>("");
  const [busy, setBusy] = useState(false);

  async function runSpec() {
    setBusy(true);
    try {
      const parsed = JSON.parse(spec);
      const r = await fetch("/api/trader/lab/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec: parsed }),
      });
      setResult(JSON.stringify(await r.json(), null, 2));
    } catch (e) {
      setResult(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function draftFromEnglish() {
    setBusy(true);
    try {
      const r = await fetch("/api/trader/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message:
            "Draft an ExperimentSpec JSON only for this hypothesis. Use event_iv_crush if it is an earnings IV crush. Do not invent results.\n\n" +
            nl,
        }),
      });
      const data = await r.json();
      setResult(data.reply || JSON.stringify(data, null, 2));
    } catch (e) {
      setResult(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SiteNav />
      <h1 className="page-title fade d1">Lab</h1>
      <p className="page-dek fade d1">
        English → spec draft, then a real spy_lab walk-forward (CI + t-stat when N allows).
        Prefer kill.
      </p>
      <div className="trader-grid fade d2">
        <section className="trader-card">
          <h2>Hypothesis in English</h2>
          <form
            className="trader-form"
            onSubmit={(e) => {
              e.preventDefault();
              void draftFromEnglish();
            }}
          >
            <textarea
              value={nl}
              onChange={(e) => setNl(e.target.value)}
              placeholder="Vol gets crushed in shorter-dated options after a major earnings release."
            />
            <button className="trader-btn" type="submit" disabled={busy}>
              draft spec
            </button>
          </form>
        </section>
        <section className="trader-card">
          <h2>ExperimentSpec JSON</h2>
          <form
            className="trader-form"
            onSubmit={(e) => {
              e.preventDefault();
              void runSpec();
            }}
          >
            <textarea value={spec} onChange={(e) => setSpec(e.target.value)} />
            <button className="trader-btn" type="submit" disabled={busy}>
              run walk-forward
            </button>
          </form>
        </section>
      </div>
      {result && (
        <section className="trader-card fade d3" style={{ marginTop: 20 }}>
          <h2>Result</h2>
          <pre>{result}</pre>
        </section>
      )}
    </>
  );
}
