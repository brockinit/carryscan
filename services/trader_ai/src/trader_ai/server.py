"""Cloud Run / local FastAPI."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from trader_ai import store
from trader_ai.agent import run_turn
from trader_ai.briefs import run_postclose, run_preopen
from trader_ai.flow_jobs import run_daily as run_flow_daily
from trader_ai.tape import run_once
from trader_ai.train import export_gold, run_eval, vertex_sft_plan

app = FastAPI(title="trader-ai", version="0.1.0")


class ChatIn(BaseModel):
    message: str
    escalate: bool = False
    history: list[dict] = Field(default_factory=list)


class TradeIn(BaseModel):
    ticker: str
    structure: str | None = None
    side: str | None = None
    size: float | None = None
    entry: float | None = None
    exit: float | None = None
    tags: list[str] = Field(default_factory=list)
    thesis: str | None = None


class JournalIn(BaseModel):
    body: str
    as_of: str | None = None
    trade_id: int | None = None
    setup: str | None = None
    emotion: str | None = None
    rule_followed: bool | None = None


class BehaviorIn(BaseModel):
    id: str
    title: str
    expected: str
    trigger: dict = Field(default_factory=dict)
    status: str = "draft"
    linked_spec_id: str | None = None


class ReviewApproveIn(BaseModel):
    as_of: str
    approved: str


class PlaybookIn(BaseModel):
    id: str
    body: str


class FeedbackIn(BaseModel):
    kind: str
    target_type: str
    target_id: str
    rating: int | None = None
    note: str | None = None


class SpecIn(BaseModel):
    spec: dict[str, Any]


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/chat")
def chat(body: ChatIn) -> dict:
    return run_turn(body.message, escalate=body.escalate, history=body.history)


@app.get("/tape")
def tape(ticker: str = "SPY") -> dict:
    from trader_ai.tools import get_tape

    return get_tape(ticker)


@app.get("/character")
def character(ticker: str = "SPY") -> dict:
    from trader_ai.tools import get_character

    return get_character(ticker)


@app.get("/brief")
def brief(as_of: str | None = None, kind: str | None = None) -> dict:
    row = store.get_brief(as_of, kind)
    return {"brief": row}


@app.post("/brief/preopen")
def brief_preopen(ticker: str = "SPY") -> dict:
    return run_preopen(ticker)


@app.post("/brief/postclose")
def brief_postclose(ticker: str = "SPY") -> dict:
    return run_postclose(ticker)


@app.post("/tape/tick")
def tape_tick(force: bool = True) -> dict:
    return {"ticks": run_once(force=force)}


@app.post("/flow/daily")
def flow_daily() -> dict:
    return {"rows": run_flow_daily()}


@app.get("/journal")
def journal() -> dict:
    return {"entries": store.list_journal(), "trades": store.list_trades()}


@app.post("/journal")
def journal_create(body: JournalIn) -> dict:
    jid = store.insert_journal(body.model_dump())
    return {"id": jid}


@app.post("/trades")
def trade_create(body: TradeIn) -> dict:
    tid = store.insert_trade(body.model_dump())
    return {"id": tid}


@app.get("/behaviors")
def behaviors(status: str | None = None) -> dict:
    return {"behaviors": store.list_behaviors(status)}


@app.post("/behaviors")
def behavior_upsert(body: BehaviorIn) -> dict:
    store.upsert_behavior(body.model_dump())
    return {"ok": True}


@app.post("/behaviors/{bid}/{status}")
def behavior_status(bid: str, status: str) -> dict:
    if status not in ("draft", "promoted", "demoted"):
        raise HTTPException(400, "bad status")
    store.set_behavior_status(bid, status)
    return {"ok": True, "id": bid, "status": status}


@app.get("/playbook")
def playbook() -> dict:
    return {"rules": store.list_playbook()}


@app.post("/playbook")
def playbook_upsert(body: PlaybookIn) -> dict:
    version = store.upsert_playbook(body.id, body.body)
    return {"id": body.id, "version": version}


@app.post("/feedback")
def feedback(body: FeedbackIn) -> dict:
    store.add_feedback(body.kind, body.target_type, body.target_id, body.rating, body.note)
    return {"ok": True}


@app.get("/reviews")
def reviews() -> dict:
    return {"reviews": store.list_reviews()}


@app.get("/reviews/{as_of}")
def review_get(as_of: str) -> dict:
    return {"review": store.get_review(as_of)}


@app.post("/reviews/approve")
def review_approve(body: ReviewApproveIn) -> dict:
    store.approve_review(body.as_of, body.approved)
    return {"ok": True}


@app.post("/lab/run")
def lab_run(body: SpecIn) -> dict:
    from trader_ai.tools import run_backtest

    return run_backtest(body.spec)


@app.post("/train/export")
def train_export() -> dict:
    root = export_gold()
    return {"dir": str(root)}


@app.post("/train/eval")
def train_eval(escalate: bool = False) -> dict:
    return run_eval(escalate=escalate)


@app.get("/train/sft-plan")
def train_sft() -> dict:
    return vertex_sft_plan()
