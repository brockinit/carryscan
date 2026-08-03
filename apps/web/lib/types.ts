import type { Positioning } from "@/lib/positioning";
import type { Capacity } from "@/lib/capacity";
import type { FundingDist, Stress } from "@/lib/desk";

export type BasisTerm = {
  cash_close: number | null;
  oracle: number | null;
  nbbo: number | null;
  vwap: number | null;
};

export type MarketRow = {
  coin: string;
  ticker: string;
  name: string;
  dex: string;
  ref_type: "stock" | "etf_proxy" | "none";
  mark: number;
  basis_pct: number | null;
  basis_ref: "oracle" | "cash_close";
  basis_term: BasisTerm;
  apr_now: number;
  apr_1d: number;
  apr_7d: number;
  apr_30d: number;
  oi_usd: number;
  spark: number[];
  positioning: Positioning;
  funding_dist: FundingDist;
  capacity: Capacity;
  borrow_default_pct: number;
  borrow_source: "ibkr_flex" | "csv" | "indicative";
  max_leverage: number | null;
  stress: Stress | null;
};

export type MarketsResponse = {
  as_of: string | null;
  stale: boolean;
  live_mode?: boolean;
  defaults: { borrow_pct: number; fees_rt_bps: number; horizon: string };
  summary: {
    richest: { coin: string; net_carry: number } | null;
    median_apr_7d: number;
    weekend_premium_pts: number;
    total_oi_usd: number;
    dex_count: number;
  };
  positioning_summary: {
    most_long: { coin: string; crowd_score: number } | null;
    most_short: { coin: string; crowd_score: number } | null;
    acute_count: number;
    median_abs_score: number;
  };
  markets: MarketRow[];
};

export type RiskPosition = {
  coin: string;
  dex: string;
  szi: number;
  liquidation_px: number | null;
  mark: number | null;
  distance_pct: number | null;
  margin_used: number | null;
  leverage: number | null;
};

export type RiskResponse = {
  configured: boolean;
  address: string | null;
  as_of: string | null;
  account_value: number | null;
  total_margin_used: number | null;
  withdrawable: number | null;
  positions: RiskPosition[];
};

export type MarketDetail = {
  coin: string;
  ticker: string;
  name: string;
  ref_type: string;
  as_of: string | null;
  live: {
    mark: number;
    basis_pct: number | null;
    apr_now: number;
    apr_7d: number;
    apr_1d: number;
    apr_30d: number;
    oi_usd: number;
  };
  heatmap: {
    tz: string;
    days: string[];
    cells: number[][];
  };
  weekend_premium_pts: number;
  history_30d: {
    start: string;
    daily_apr: number[];
    weekend_idx: number[][];
  };
  weekend_gaps: Array<{
    weekend_start: string;
    perp_drift: number;
    cash_gap: number;
    short_mae: number;
    funding_banked: number;
  }>;
  earnings: {
    next: { print_date: string; session: string; estimated: boolean } | null;
    windows: Array<{
      print_date: string;
      window_avg: number;
      delta_vs_baseline: number;
      peak_basis: number;
    }>;
  };
};
