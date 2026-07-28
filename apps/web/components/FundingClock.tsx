"use client";

/** Ported heat() + cash-session hatch from mockup. */
function heat(v: number): string {
  if (v < 0) {
    return `rgba(239,111,108,${Math.min(0.85, 0.18 + (-v / 12) * 0.6)})`;
  }
  const t = v / 58;
  if (t < 0.35) {
    return `rgb(${19 + t * 80},${26 + t * 60},${40 + t * 40})`;
  }
  const u = (t - 0.35) / 0.65;
  return `rgb(${45 + u * 210},${47 + u * 164},${66 + u * 56})`;
}

type Props = {
  days: string[];
  cells: number[][];
  weekendPremium: number;
};

export function FundingClock({ days, cells, weekendPremium }: Props) {
  return (
    <section className="mt-5 border border-[var(--line)] bg-[var(--panel)]" aria-label="Funding clock heatmap">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] px-[18px] py-3.5">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
          Funding clock · avg APR by hour, trailing 90d · ET
        </h2>
        <div className="font-sans text-xs text-[var(--muted)]">
          Weekend cells run{" "}
          <b className="font-medium text-[var(--gold-hi)]">
            {weekendPremium > 0 ? "+" : ""}
            {weekendPremium.toFixed(1)} pts
          </b>{" "}
          hotter than weekdays. Carry lives where the cash market sleeps.
        </div>
      </div>
      <div className="overflow-x-auto p-[18px]">
        <div
          className="grid min-w-[820px] gap-0.5"
          style={{ gridTemplateColumns: "52px repeat(24, minmax(22px, 1fr))" }}
          role="img"
          aria-label="Heatmap of average funding APR by day of week and hour"
        >
          <div />
          {Array.from({ length: 24 }, (_, h) => (
            <div
              key={h}
              className="font-mono text-center text-[9.5px] text-[var(--faint)]"
            >
              {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
            </div>
          ))}
          {days.map((day, d) => (
            <DayRow key={day} day={day} d={d} cells={cells[d] || Array(24).fill(0)} />
          ))}
        </div>
      </div>
      <div className="font-mono flex flex-wrap items-center gap-3 px-[18px] pb-4 text-[10.5px] text-[var(--muted)]">
        <span>−20</span>
        <span
          className="h-2 w-[180px] rounded-[1px]"
          style={{
            background:
              "linear-gradient(90deg,#EF6F6C,#131A28 32%,#6B5A3E 55%,#E8B54D 80%,#FFD37A)",
          }}
          aria-hidden
        />
        <span>+60 APR pts</span>
        <span
          className="ml-[18px] h-2.5 w-4 rounded-[1px]"
          style={{
            background:
              "repeating-linear-gradient(135deg,#2A3350 0 3px,rgba(12,17,27,.55) 3px 5px)",
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
      <div className="font-mono self-center text-[10.5px] text-[var(--muted)]">
        {day}
      </div>
      {cells.map((v, h) => {
        const cash = d < 5 && h >= 10 && h <= 15;
        return (
          <div
            key={`${d}-${h}`}
            className={`rounded-[1px] hover:z-[2] hover:outline hover:outline-1 hover:outline-[var(--gold-hi)] ${
              cash ? "cash-cell" : ""
            }`}
            style={{ aspectRatio: "1.35/1", background: heat(v) }}
            title={`${day} ${String(h).padStart(2, "0")}:00 · ${v > 0 ? "+" : ""}${v.toFixed(1)} APR pts`}
          />
        );
      })}
    </>
  );
}
