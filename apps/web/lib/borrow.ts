/** Indicative per-name hedge borrow defaults + local overrides. */

/** Soft defaults — replace with a live HTB feed when available. */
export const DEFAULT_BORROW_BY_TICKER: Record<string, number> = {
  AAPL: 0.8,
  MSFT: 0.6,
  GOOGL: 0.7,
  AMZN: 0.8,
  META: 1.0,
  NVDA: 1.2,
  AMD: 2.5,
  TSLA: 3.5,
  PLTR: 6.0,
  COIN: 8.0,
  HOOD: 12.0,
  MSTR: 15.0,
  SPCX: 8.0,
  XYZ100: 0.5,
  QQQ: 0.5,
};

export const BORROW_KEY = "carryscan.borrow.v1";

export function defaultBorrow(ticker: string, fallback = 5.5): number {
  return DEFAULT_BORROW_BY_TICKER[ticker.toUpperCase()] ?? fallback;
}

export function loadBorrowOverrides(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(BORROW_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(obj)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k.toUpperCase()] = Math.min(80, Math.max(0, n));
    }
    return out;
  } catch {
    return {};
  }
}

export function saveBorrowOverrides(map: Record<string, number>) {
  localStorage.setItem(BORROW_KEY, JSON.stringify(map));
}

export function borrowFor(
  ticker: string,
  overrides: Record<string, number>,
  globalFallback = 5.5,
): number {
  const t = ticker.toUpperCase();
  if (overrides[t] != null) return overrides[t];
  return defaultBorrow(t, globalFallback);
}
