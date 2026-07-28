/** Pure metric functions — CarryScan §4. No I/O. */

export const HOURS_PER_YEAR = 24 * 365;
export const ET = "America/New_York";

export function apr(rates: number[]): number {
  if (!rates.length) return 0;
  const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
  return mean * HOURS_PER_YEAR * 100;
}

export function feeDrag(feesRtBps: number, horizonDays: number): number {
  if (horizonDays <= 0) return 0;
  return (feesRtBps / 100) * (365 / horizonDays);
}

export function netCarry(
  aprHorizon: number,
  borrowPct: number,
  feesRtBps: number,
  horizonDays: number,
): number {
  return aprHorizon - borrowPct - feeDrag(feesRtBps, horizonDays);
}

export function basis(mark: number, refClose: number): number {
  if (refClose === 0) return 0;
  return ((mark - refClose) / refClose) * 100;
}

export function hourlyToApr(rate: number): number {
  return rate * HOURS_PER_YEAR * 100;
}

/** (dow Mon=0..Sun=6, hour 0..23) in America/New_York */
export function etBucket(ts: Date): [number, number] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(ts);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  return [map[wd] ?? 0, hour];
}

export function heatmapCells(
  ticks: Array<[Date, number]>,
): number[][] {
  const buckets = new Map<string, number[]>();
  for (const [ts, rate] of ticks) {
    const [d, h] = etBucket(ts);
    const key = `${d}:${h}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(rate);
  }
  const matrix: number[][] = [];
  for (let d = 0; d < 7; d++) {
    const row: number[] = [];
    for (let h = 0; h < 24; h++) {
      const rates = buckets.get(`${d}:${h}`) ?? [];
      row.push(rates.length ? apr(rates) : 0);
    }
    matrix.push(row);
  }
  return matrix;
}

export function weekendPremium(matrix: number[][]): number {
  const weekday: number[] = [];
  const weekend: number[] = [];
  matrix.forEach((row, d) => {
    (d >= 5 ? weekend : weekday).push(...row);
  });
  if (!weekday.length || !weekend.length) return 0;
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  return mean(weekend) - mean(weekday);
}

export function sparkline12h(
  ratesWithTs: Array<[Date, number]>,
  n = 14,
): number[] {
  if (!ratesWithTs.length) return Array(n).fill(0);
  const sorted = [...ratesWithTs].sort((a, b) => a[0].getTime() - b[0].getTime());
  const end = sorted[sorted.length - 1][0];
  const start = new Date(end.getTime() - 12 * n * 3600 * 1000);
  const buckets: number[][] = Array.from({ length: n }, () => []);
  for (const [ts, rate] of sorted) {
    if (ts < start) continue;
    const idx = Math.floor((ts.getTime() - start.getTime()) / (12 * 3600 * 1000));
    if (idx >= 0 && idx < n) buckets[idx].push(rate);
  }
  return buckets.map((b) => (b.length ? apr(b) : 0));
}

export type Candle = [Date, number, number, number, number]; // ts,o,h,l,c

function etParts(ts: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ET,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(ts).map((p) => [p.type, p.value]),
  );
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday as string,
  };
}

/** Compare candle ET time against Friday 16:00 / Monday 09:30 on given Friday date (YYYY-MM-DD ET). */
function etDateKey(ts: Date): string {
  const p = etParts(ts);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function weekendGap(
  candles: Candle[],
  funding: Array<[Date, number]>,
  friCashClose: number | null,
  monCashOpen: number | null,
  weekendFriday: string, // YYYY-MM-DD
): {
  perp_drift: number;
  cash_gap: number;
  short_mae: number;
  funding_banked: number;
} | null {
  const monDate = addDaysYmd(weekendFriday, 3);

  const friCandles = candles.filter((c) => {
    const p = etParts(c[0]);
    const key = etDateKey(c[0]);
    if (key < weekendFriday) return true;
    if (key > weekendFriday) return false;
    return p.hour < 16 || (p.hour === 16 && p.minute === 0);
  });
  // last candle with ET <= Fri 16:00
  const friEligible = candles.filter((c) => {
    const key = etDateKey(c[0]);
    const p = etParts(c[0]);
    if (key < weekendFriday) return true;
    if (key === weekendFriday) return p.hour < 16 || (p.hour === 16 && p.minute === 0);
    return false;
  });
  const monEligible = candles.filter((c) => {
    const key = etDateKey(c[0]);
    const p = etParts(c[0]);
    if (key > monDate) return true;
    if (key === monDate) return p.hour > 9 || (p.hour === 9 && p.minute >= 30);
    return false;
  });

  void friCandles;
  if (!friEligible.length || !monEligible.length) return null;

  const friRef = friEligible[friEligible.length - 1][4];
  const monRef = monEligible[0][1];

  const closed = candles.filter((c) => {
    const key = etDateKey(c[0]);
    const p = etParts(c[0]);
    const afterFri =
      key > weekendFriday ||
      (key === weekendFriday && (p.hour > 16 || (p.hour === 16 && p.minute >= 0)));
    const beforeMon =
      key < monDate ||
      (key === monDate && (p.hour < 9 || (p.hour === 9 && p.minute < 30)));
    // fri_deadline <= ts < mon_open
    const geFri =
      key > weekendFriday ||
      (key === weekendFriday && (p.hour > 16 || (p.hour === 16 && p.minute >= 0)));
    // include Fri 16:00 candle
    const geFriIncl =
      key > weekendFriday ||
      (key === weekendFriday && p.hour >= 16);
    return geFriIncl && beforeMon;
  });

  const maxHigh = closed.length
    ? Math.max(...closed.map((c) => c[2]))
    : friRef;

  const perpDrift = friRef ? monRef / friRef - 1 : 0;
  const shortMae = friRef ? maxHigh / friRef - 1 : 0;
  let cashGap = 0;
  if (friCashClose && monCashOpen && friCashClose !== 0) {
    cashGap = monCashOpen / friCashClose - 1;
  }

  const fundSum = funding
    .filter(([ts]) => {
      const key = etDateKey(ts);
      const p = etParts(ts);
      const geFri =
        key > weekendFriday ||
        (key === weekendFriday && p.hour >= 16);
      const beforeMon =
        key < monDate ||
        (key === monDate && (p.hour < 9 || (p.hour === 9 && p.minute < 30)));
      return geFri && beforeMon;
    })
    .reduce((s, [, r]) => s + r, 0);

  return {
    perp_drift: perpDrift * 100,
    cash_gap: cashGap * 100,
    short_mae: shortMae * 100,
    funding_banked: fundSum * 100,
  };
}

export function earningsWindowBounds(printDate: string): [Date, Date] {
  // T-3 00:00 ET → T+1 23:59 ET — approximate via UTC offset lookup
  const startKey = addDaysYmd(printDate, -3);
  const endKey = addDaysYmd(printDate, 1);
  // Construct as noon UTC then adjust; for rate filtering we compare ET date keys
  const start = etWallTimeToUtc(startKey, 0, 0);
  const end = etWallTimeToUtc(endKey, 23, 59);
  return [start, end];
}

/** Convert an ET calendar wall time to a UTC Date (handles DST via binary search on formatter). */
export function etWallTimeToUtc(ymd: string, hour: number, minute: number): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  // Guess UTC = ET+4 or ET+5; refine by checking formatter
  for (const offset of [4, 5, 3, 6]) {
    const guess = new Date(Date.UTC(y, m - 1, d, hour + offset, minute));
    const p = etParts(guess);
    if (
      p.y === y &&
      p.m === m &&
      p.d === d &&
      p.hour === hour &&
      p.minute === minute
    ) {
      return guess;
    }
  }
  // fallback EDT
  return new Date(Date.UTC(y, m - 1, d, hour + 4, minute));
}

export { etDateKey, etParts, addDaysYmd };
