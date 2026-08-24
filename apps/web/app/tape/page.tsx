"use client";

import useSWR from "swr";
import { SiteNav } from "@/components/SiteNav";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function TapePage() {
  const { data, isLoading } = useSWR("/api/trader/tape?ticker=SPY", fetcher, {
    refreshInterval: 30_000,
  });
  const gex = data?.gex;
  const character = data?.character;
  const notables = data?.notables ?? [];
  const flow = data?.flow;

  return (
    <>
      <SiteNav />
      <h1 className="page-title fade d1">Tape</h1>
      <p className="page-dek fade d1">
        Live context only — GEX, character, notables, inferred flow. Refresh while the
        tape worker is running.
      </p>
      <div className="status-row fade d1">
        <span>{isLoading ? "loading…" : data?.offline ? "trader_ai offline" : "SPY"}</span>
        {data?.inferred && <span>/ inferred flow</span>}
      </div>
      <div className="trader-grid fade d2">
        <section className="trader-card">
          <h2>GEX</h2>
          {gex ? (
            <pre>
              {`sign ${gex.gamma_sign ?? "—"}
net ${gex.net_gex ?? "—"}
spot ${gex.spot ?? "—"}
call wall ${gex.call_wall ?? "—"}
put wall ${gex.put_wall ?? "—"}
max gex ${gex.max_gex_strike ?? "—"}`}
            </pre>
          ) : (
            <p className="dim">No snapshot yet. Run trader-ai tape --force.</p>
          )}
        </section>
        <section className="trader-card">
          <h2>Character</h2>
          {character ? (
            <pre>
              {`${character.label}
apply ${((character.apply_strategies as string[]) || []).join(", ")}
avoid ${((character.avoid_strategies as string[]) || []).join(", ")}
flipped ${character.flipped ? "yes" : "no"}`}
            </pre>
          ) : (
            <p className="dim">No character row yet.</p>
          )}
        </section>
        <section className="trader-card">
          <h2>Inferred flow</h2>
          {flow ? <pre>{flow.note || JSON.stringify(flow, null, 2)}</pre> : <p className="dim">No daily rollup.</p>}
        </section>
        <section className="trader-card">
          <h2>Notables</h2>
          {notables.length === 0 ? (
            <p className="dim">None stored.</p>
          ) : (
            <ul className="trader-list">
              {notables.map((n: { occ: string; premium: number; ts: string }) => (
                <li key={`${n.occ}-${n.ts}`}>
                  {n.occ} · {n.premium}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
