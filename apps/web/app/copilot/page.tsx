"use client";

import { useState } from "react";
import { SiteNav } from "@/components/SiteNav";

type Turn = { role: "user" | "assistant"; body: string };

export default function CopilotPage() {
  const [input, setInput] = useState("");
  const [escalate, setEscalate] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    const msg = input.trim();
    if (!msg) return;
    setInput("");
    setBusy(true);
    setErr(null);
    setTurns((t) => [...t, { role: "user", body: msg }]);
    try {
      const r = await fetch("/api/trader/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: msg, escalate }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || data.error || "offline");
      setTurns((t) => [...t, { role: "assistant", body: data.reply || JSON.stringify(data) }]);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SiteNav />
      <h1 className="page-title fade d1">Copilot</h1>
      <p className="page-dek fade d1">
        Ask about tape, character, a hypothesis, or a lesson to remember. Numbers come from
        tools — nothing pages you.
      </p>
      <div className="trader-chat fade d2">
        {turns.map((t, i) => (
          <div key={i} className={`trader-bubble ${t.role}`}>
            <div className="dim">{t.role}</div>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{t.body}</div>
          </div>
        ))}
        {err && <p className="neg">{err}</p>}
        <form
          className="trader-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="How is SPY treating VWAP in this character?"
          />
          <label className="dim">
            <input
              type="checkbox"
              checked={escalate}
              onChange={(e) => setEscalate(e.target.checked)}
            />{" "}
            Escalate (Grok / Opus if configured)
          </label>
          <button className="trader-btn" type="submit" disabled={busy}>
            {busy ? "thinking…" : "send"}
          </button>
        </form>
      </div>
    </>
  );
}
