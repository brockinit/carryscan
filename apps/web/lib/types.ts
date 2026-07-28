export type MarketRow = {
  coin: string;
  ticker: string;
  name: string;
  ref_type: "stock" | "etf_proxy" | "none";
  mark: number;
  basis_pct: number | null;
  apr_now: number;
  apr_1d: number;
  apr_7d: number;
  apr_30d: number;
  oi_usd: number;
  spark: number[];
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
  };
  markets: MarketRow[];
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
