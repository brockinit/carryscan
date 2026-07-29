"use client";

/** Diverging heat adapted for paper theme (mint ↔ coral). */
function heat(v: number): string {
  if (v < 0) {
    return `rgba(200,49,47,${Math.min(0.75, 0.12 + (-v / 12) * 0.55)})`;
  }
  const t = Math.min(1, v / 58);
  if (t < 0.35) {
    return `rgba(12,110,94,${0.06 + t * 0.25})`;
  }
  const u = (t - 0.35) / 0.65;
  return `rgba(12,110,94,${0.2 + u * 0.55})`;
}

type Props = {
  days: string[];
  cells: number[][];
  weekendPremium: number;
};

export function FundingClock({ days, cells, weekendPremium }: Props) {
  return (
    <section className="panel fade d2" aria-label="Funding clock heatmap">
      <div className="shead">
        <h2>Funding clock · avg APR by hour, trailing 90d · ET</h2>
        <div className="note">
          Weekend cells run{" "}
          <b>
            {weekendPremium > 0 ? "+" : ""}
            {weekendPremium.toFixed(1)} pts
          </b>{" "}
          hotter than weekdays. Carry lives where the cash market sleeps.
        </div>
      </div>
      <div className="pad" style={{ overflowX: "auto" }}>
        <div
          className="clock"
          role="img"
          aria-label="Heatmap of average funding APR by day of week and hour"
        >
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="hlab">
              {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
            </div>
          ))}
          {days.map((day, d) => (
            <DayRow key={day} day={day} d={d} cells={cells[d] || Array(24).fill(0)} />
          ))}
        </div>
      </div>
      <div className="legend">
        <span>−20</span>
        <span
          style={{
            width: 180,
            height: 8,
            borderRadius: 1,
            background:
              "linear-gradient(90deg,#c8312f,#f7f6f3 32%,#a8d5ce 55%,#0c6e5e 80%,#053f37)",
          }}
          aria-hidden
        />
        <span>+60 APR pts</span>
        <span
          style={{
            marginLeft: 18,
            width: 16,
            height: 10,
            borderRadius: 1,
            background:
              "repeating-linear-gradient(135deg,#d8dcd5 0 3px,rgba(10,10,10,.08) 3px 5px)",
          }}
          aria-hidden
        />
        <span>cash session 09:30–16:00 ET</span>
      </div>
    </section>
  );
}

function DayRow({
  day,
  d,
  cells,
}: {
  day: string;
  d: number;
  cells: number[];
}) {
  return (
    <>
      <div className="lab">{day}</div>
      {cells.map((v, h) => {
        const cash = d < 5 && h >= 10 && h <= 15;
        return (
          <div
            key={`${d}-${h}`}
            className={cash ? "cash-cell" : undefined}
            style={{
              aspectRatio: "1.35/1",
              borderRadius: 1,
              background: heat(v),
            }}
            title={`${day} ${String(h).padStart(2, "0")}:00 · ${v > 0 ? "+" : ""}${v.toFixed(1)} APR pts`}
          />
        );
      })}
    </>
  );
}
