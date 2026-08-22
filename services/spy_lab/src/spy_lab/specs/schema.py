"""Experiment specification schema."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Structure = Literal[
    "iv_short_30d",
    "rr_fade_30d",
    "underlying_gate",
    "opex_vs_next_oc_range",
    "pin_range_compress",
    "odte_pin_forecast",
    "fly_wait_for_print",
]


class EventGates(BaseModel):
    require_any: list[str] = Field(default_factory=list)
    exclude_any: list[str] = Field(default_factory=list)


class EntryRules(BaseModel):
    rel_vol_max: float | None = None
    rel_vol_min: float | None = None
    abs_gap_max: float | None = None
    abs_gap_min: float | None = None
    gap_side: Literal["down", "up", "any"] | None = "any"
    vix_max: float | None = None
    vix_min: float | None = None
    vix_similar_max: float | None = None  # |ΔVIX| vs next session
    magnet_max_pct: float | None = None


class ExperimentSpec(BaseModel):
    id: str
    title: str
    universe: str = "SPY"
    structure: Structure
    hold_days: int = 5
    entry: EntryRules = Field(default_factory=EntryRules)
    event_gates: EventGates = Field(default_factory=EventGates)
    decision_time: Literal["pre_open", "before_moc", "next_open"] = "pre_open"
    cost_bps: float = 5.0
    train_start: str
    train_end: str
    test_start: str
    test_end: str
    min_trades: int = 40
    kill_if_test_net_le_zero: bool = True
    kill_if_decay_gt: float = 0.5
    # Panel columns required to evaluate (missing → DATA_BLOCKED, not KILL)
    data_requirements: list[str] = Field(default_factory=list)
    thesis: str = ""

    def event_gate_keys(self) -> list[str]:
        return list(
            dict.fromkeys(self.event_gates.require_any + self.event_gates.exclude_any)
        )
