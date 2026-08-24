"use client";

import { useState } from "react";
import useSWR from "swr";
import { SiteNav } from "@/components/SiteNav";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ReviewPage() {
  const { data: reviews, mutate: mutR } = useSWR("/api/trader/reviews", fetcher);
  const { data: beh, mutate: mutB } = useSWR("/api/trader/behaviors", fetcher);
  const [asOf, setAsOf] = useState("");
  const [detail, setDetail] = useState<string>("");
  const [approved, setApproved] = useState("");
  const [bid, setBid] = useState("earnings_short_iv_crush");
  const [btitle, setBtitle] = useState("Short-dated IV crush after earnings");
  const [bexp, setBexp] = useState("IV in DTE<=7 contracts falls after the print");

  async function loadReview(d: string) {
    setAsOf(d);
    const r = await fetch(`/api/trader/reviews/${d}`);
    const data = await r.json();
    const rev = data.review;
    setDetail(rev?.draft || "");
    setApproved(rev?.approved || rev?.draft || "");
  }

  async function approve() {
    await fetch("/api/trader/reviews/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ as_of: asOf, approved }),
    });
    await mutR();
  }

  async function saveBehavior() {
    await fetch("/api/trader/behaviors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: bid,
        title: btitle,
        expected: bexp,
        trigger: { event: "earnings", max_dte: 7 },
        status: "draft",
      }),
    });
    await mutB();
  }

  async function setStatus(id: string, status: string) {
    await fetch(`/api/trader/behaviors/${id}/${status}`, { method: "POST" });
    await mutB();
  }

  return (
    <>
      <SiteNav />
      <h1 className="page-title fade d1">Review</h1>
      <p className="page-dek fade d1">
        Approve the EOD draft (gold). Promote or demote behaviors so the next brief can cite
        them.
      </p>
      <div className="trader-grid fade d2">
        <section className="trader-card">
          <h2>Daily reviews</h2>
          <ul className="trader-list">
            {(reviews?.reviews ?? []).map((r: { as_of: string; status: string }) => (
              <li key={r.as_of}>
                <button className="linkish" onClick={() => void loadReview(r.as_of)}>
                  {r.as_of}
                </button>{" "}
                <span className="dim">{r.status}</span>
              </li>
            ))}
          </ul>
          {asOf && (
            <form
              className="trader-form"
              onSubmit={(e) => {
                e.preventDefault();
                void approve();
              }}
            >
              <p className="dim">draft</p>
              <pre>{detail}</pre>
              <textarea value={approved} onChange={(e) => setApproved(e.target.value)} />
              <button className="trader-btn" type="submit">
                approve
              </button>
            </form>
          )}
        </section>
        <section className="trader-card">
          <h2>Behaviors</h2>
          <form
            className="trader-form"
            onSubmit={(e) => {
              e.preventDefault();
              void saveBehavior();
            }}
          >
            <input value={bid} onChange={(e) => setBid(e.target.value)} placeholder="id" />
            <input value={btitle} onChange={(e) => setBtitle(e.target.value)} placeholder="title" />
            <textarea value={bexp} onChange={(e) => setBexp(e.target.value)} />
            <button className="trader-btn" type="submit">
              save draft
            </button>
          </form>
          <ul className="trader-list">
            {(beh?.behaviors ?? []).map(
              (b: { id: string; title: string; status: string; expected: string }) => (
                <li key={b.id}>
                  <strong>{b.id}</strong> <span className="dim">{b.status}</span>
                  <div>{b.title}</div>
                  <div className="dim">{b.expected}</div>
                  <button className="linkish" onClick={() => void setStatus(b.id, "promoted")}>
                    promote
                  </button>{" "}
                  <button className="linkish" onClick={() => void setStatus(b.id, "demoted")}>
                    demote
                  </button>
                </li>
              ),
            )}
          </ul>
        </section>
      </div>
    </>
  );
}
