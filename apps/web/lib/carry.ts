/** Client-side net-carry math — mirrors services/ingest/metrics §4. */

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

export function horizonDays(horizon: "1d" | "7d" | "30d"): number {
  return horizon === "1d" ? 1 : horizon === "30d" ? 30 : 7;
}

export type CarryParams = {
  borrowPct: number;
  feesRtBps: number;
  horizon: "1d" | "7d" | "30d";
};

export const DEFAULT_PARAMS: CarryParams = {
  borrowPct: 5.5,
  feesRtBps: 10,
  horizon: "7d",
};

export const PARAMS_KEY = "carryscan.params.v1";

export function loadParams(): CarryParams {
  if (typeof window === "undefined") return DEFAULT_PARAMS;
  try {
    const raw = localStorage.getItem(PARAMS_KEY);
    if (!raw) return DEFAULT_PARAMS;
    const p = JSON.parse(raw) as Partial<CarryParams>;
    return {
      borrowPct: clamp(Number(p.borrowPct ?? 5.5), 0, 50),
      feesRtBps: clamp(Number(p.feesRtBps ?? 10), 0, 100),
      horizon: (["1d", "7d", "30d"] as const).includes(p.horizon as "1d")
        ? (p.horizon as CarryParams["horizon"])
        : "7d",
    };
  } catch {
    return DEFAULT_PARAMS;
  }
}

export function saveParams(p: CarryParams) {
  localStorage.setItem(PARAMS_KEY, JSON.stringify(p));
}

function clamp(n: number, lo: number, hi: number) {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export function aprForHorizon(
  m: { apr_now: number; apr_1d: number; apr_7d: number; apr_30d: number },
  horizon: CarryParams["horizon"],
): number {
  if (horizon === "1d") return m.apr_1d;
  if (horizon === "30d") return m.apr_30d;
  return m.apr_7d;
}
