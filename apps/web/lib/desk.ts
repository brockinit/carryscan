/** Desk metrics: funding distribution, capacity, stress, basis term. */

import { capacityFromOi, type Capacity } from "@/lib/capacity";
import { defaultBorrow } from "@/lib/borrow";
import { hourlyToApr } from "@/lib/hl";
import type { BasisTerm } from "@/lib/types";

export type FundingDist = {
  apr_p25: number;
  apr_p50: number;
  apr_p75: number;
};

export type Stress = {
  mae_p50: number | null;
  mae_p90: number | null;
  funding_banked_avg: number | null;
  stress_ratio: number | null;
};

export type DeskFields = {
  funding_dist: FundingDist;
  capacity: Capacity;
  borrow_default_pct: number;
  borrow_source: "ibkr_flex" | "csv" | "indicative";
  stress: Stress | null;
  basis_ref: "oracle" | "cash_close";
  basis_term: BasisTerm;
  max_leverage: number | null;
};

function percentile(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const w = idx - lo;
  return sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w;
}

export function fundingDistFromRates(hourlyRates: number[]): FundingDist {
  if (!hourlyRates.length) {
    return { apr_p25: 0, apr_p50: 0, apr_p75: 0 };
  }
  const aprs = [...hourlyRates.map(hourlyToApr)].sort((a, b) => a - b);
  return {
    apr_p25: Math.round(percentile(aprs, 0.25) * 10) / 10,
    apr_p50: Math.round(percentile(aprs, 0.5) * 10) / 10,
    apr_p75: Math.round(percentile(aprs, 0.75) * 10) / 10,
  };
}

export function fundingDistFromAprs(aprs: number[]): FundingDist {
  if (!aprs.length) return { apr_p25: 0, apr_p50: 0, apr_p75: 0 };
  const s = [...aprs].sort((a, b) => a - b);
  return {
    apr_p25: Math.round(percentile(s, 0.25) * 10) / 10,
    apr_p50: Math.round(percentile(s, 0.5) * 10) / 10,
    apr_p75: Math.round(percentile(s, 0.75) * 10) / 10,
  };
}

export function stressFromGaps(
  gaps: Array<{ short_mae: number; funding_banked: number }>,
): Stress | null {
  if (!gaps.length) return null;
  const maes = gaps.map((g) => g.short_mae).sort((a, b) => a - b);
  const funds = gaps.map((g) => g.funding_banked);
  const mae_p50 = percentile(maes, 0.5);
  const mae_p90 = percentile(maes, 0.9);
  const funding_banked_avg = funds.reduce((a, b) => a + b, 0) / funds.length;
  const stress_ratio =
    Math.abs(funding_banked_avg) > 1e-6
      ? Math.round((mae_p90 / Math.abs(funding_banked_avg)) * 10) / 10
      : null;
  return {
    mae_p50: Math.round(mae_p50 * 100) / 100,
    mae_p90: Math.round(mae_p90 * 100) / 100,
    funding_banked_avg: Math.round(funding_banked_avg * 100) / 100,
    stress_ratio,
  };
}

export function attachDeskFields<
  T extends {
    ticker: string;
    oi_usd: number;
    apr_7d: number;
    apr_30d: number;
    spark?: number[];
    basis_pct?: number | null;
    borrow_pct?: number | null;
    borrow_source?: string | null;
    basis_oracle_pct?: number | null;
    basis_nbbo_pct?: number | null;
    basis_vwap_pct?: number | null;
    max_leverage?: number | null;
  },
>(
  rows: T[],
  opts: {
    basis_ref: "oracle" | "cash_close";
    dist?: Map<string, FundingDist>;
    stress?: Map<string, Stress | null>;
  },
): Array<T & DeskFields> {
  return rows.map((r) => {
    const coin =
      "coin" in r ? String((r as { coin?: string }).coin) : undefined;
    const fromMap = opts.dist?.get(coin || r.ticker);
    const sparkDist =
      r.spark?.length && !fromMap ? fundingDistFromAprs(r.spark) : null;
    const funding_dist =
      fromMap ??
      sparkDist ?? {
        apr_p25: r.apr_7d,
        apr_p50: r.apr_7d,
        apr_p75: r.apr_30d,
      };
    const stress =
      (coin && opts.stress?.get(coin)) || opts.stress?.get(r.ticker) || null;

    const liveBorrow = r.borrow_pct;
    const srcRaw = r.borrow_source;
    const borrow_source: DeskFields["borrow_source"] =
      liveBorrow != null && srcRaw === "ibkr_flex"
        ? "ibkr_flex"
        : liveBorrow != null && srcRaw === "csv"
          ? "csv"
          : "indicative";
    const borrow_default_pct =
      liveBorrow != null ? Number(liveBorrow) : defaultBorrow(r.ticker);

    const basis_term: BasisTerm = {
      cash_close:
        opts.basis_ref === "cash_close"
          ? (r.basis_pct ?? null)
          : (r.basis_pct ?? null),
      oracle: r.basis_oracle_pct ?? null,
      nbbo: r.basis_nbbo_pct ?? null,
      vwap: r.basis_vwap_pct ?? null,
    };
    if (opts.basis_ref === "oracle" && basis_term.oracle == null) {
      basis_term.oracle = r.basis_pct ?? null;
    }

    return {
      ...r,
      funding_dist,
      capacity: capacityFromOi(r.oi_usd),
      borrow_default_pct,
      borrow_source,
      stress,
      basis_ref: opts.basis_ref,
      basis_term,
      max_leverage: r.max_leverage ?? null,
    };
  });
}
