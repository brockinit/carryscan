"use client";

type Props = {
  dailyApr: number[];
  weekendIdx: number[][];
  start: string;
  borrowPct: number;
};

export function FundingChart({ dailyApr, weekendIdx, start, borrowPct }: Props) {
  const F = dailyApr.length ? dailyApr : Array(30).fill(0);
  const W = 640;
  const H = 190;
  const P = 26;
  const n = F.length;
  const mx = Math.max(48, ...F, borrowPct + 5);
  const mn = Math.min(0, ...F);
  const x = (i: number) => P + (i / Math.max(n - 1, 1)) * (W - P - 8);
  const y = (v: number) => H - 22 - ((v - mn) / (mx - mn || 1)) * (H - 40);

  const end = start
    ? (() => {
        const d = new Date(start + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() + n - 1);
        return d.toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      })()
    : "";
  const startLabel = start
    ? new Date(start + "T12:00:00Z").toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : "";

  const pts = F.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const ticks = [0, 12, 24, 36, 48].filter((v) => v <= mx);

  return (
    <section className="mt-5 border border-[var(--line)] bg-[var(--panel)]" aria-label="Funding history">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] px-[18px] py-3.5">
        <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
          Realized funding · daily APR · 30d
        </h2>
        <div className="font-sans text-xs text-[var(--muted)]">
          gold band = weekends · dashed = your borrow hurdle {borrowPct.toFixed(1)}%
        </div>
      </div>
      <div className="p-[18px]">
        <svg
          className="block h-auto w-full"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="30 day funding APR line chart"
        >
          <defs>
            <linearGradient id="gfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgba(232,181,77,.28)" />
              <stop offset="1" stopColor="rgba(232,181,77,0)" />
            </linearGradient>
          </defs>
          {weekendIdx.map(([a, b], i) => (
            <rect
              key={i}
              x={x(a) - 6}
              y={12}
              width={x(b) - x(a) + 12}
              height={H - 34}
              fill="rgba(232,181,77,.07)"
            />
          ))}
          <line
            x1={P}
            x2={W - 8}
            y1={y(borrowPct)}
            y2={y(borrowPct)}
            stroke="var(--muted)"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
          <text
            x={W - 8}
            y={y(borrowPct) - 5}
            textAnchor="end"
            fill="var(--muted)"
            style={{ fontFamily: "var(--font-mono)", fontSize: 9.5 }}
          >
            borrow {borrowPct.toFixed(1)}
          </text>
          <polygon
            points={`${x(0)},${y(0)} ${pts} ${x(n - 1)},${y(0)}`}
            fill="url(#gfill)"
          />
          <polyline points={pts} fill="none" stroke="var(--gold)" strokeWidth={1.6} />
          {ticks.map((v) => (
            <text
              key={v}
              x={4}
              y={y(v) + 3}
              fill="var(--faint)"
              style={{ fontFamily: "var(--font-mono)", fontSize: 9.5 }}
            >
              {v}
            </text>
          ))}
          <text
            x={x(0)}
            y={H - 6}
            fill="var(--faint)"
            style={{ fontFamily: "var(--font-mono)", fontSize: 9.5 }}
          >
            {startLabel}
          </text>
          <text
            x={x(n - 1)}
            y={H - 6}
            textAnchor="end"
            fill="var(--faint)"
            style={{ fontFamily: "var(--font-mono)", fontSize: 9.5 }}
          >
            {end}
          </text>
        </svg>
      </div>
    </section>
  );
}
