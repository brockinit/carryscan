"use client";

import { useState } from "react";
import useSWR from "swr";
import { SiteNav } from "@/components/SiteNav";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function JournalPage() {
  const { data, mutate } = useSWR("/api/trader/journal", fetcher);
  const [ticker, setTicker] = useState("SPY");
  const [thesis, setThesis] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (thesis) {
        await fetch("/api/trader/trades", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ticker, thesis }),
        });
      }
      if (body) {
        await fetch("/api/trader/journal", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body, setup: ticker }),
        });
      }
      setThesis("");
      setBody("");
      await mutate();
    } finally {
      setBusy(false);
    }
  }

  const entries = data?.entries ?? [];
  const trades = data?.trades ?? [];

  return (
    <>
      <SiteNav />
      <h1 className="page-title fade d1">Journal</h1>
      <p className="page-dek fade d1">Log a trade and a note. Approved lessons live under behaviors on Review.</p>
      <form className="trader-form fade d2" onSubmit={(e) => void save(e)}>
        <input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="ticker" />
        <input value={thesis} onChange={(e) => setThesis(e.target.value)} placeholder="thesis (optional trade)" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="what did you see?" />
        <button className="trader-btn" type="submit" disabled={busy}>
          save
        </button>
      </form>
      <div className="trader-grid fade d3">
        <section className="trader-card">
          <h2>Notes</h2>
          <ul className="trader-list">
            {entries.map((j: { id: number; body: string; as_of: string }) => (
              <li key={j.id}>
                <span className="dim">{j.as_of}</span>
                <div>{j.body}</div>
              </li>
            ))}
          </ul>
        </section>
        <section className="trader-card">
          <h2>Trades</h2>
          <ul className="trader-list">
            {trades.map((t: { id: number; ticker: string; thesis: string }) => (
              <li key={t.id}>
                {t.ticker} — {t.thesis}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
