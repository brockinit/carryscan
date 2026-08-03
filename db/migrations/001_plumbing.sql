-- External plumbing: basis term structure, borrow, margin, HIP-3 discovery helpers

ALTER TABLE market_metrics_live
  ADD COLUMN IF NOT EXISTS basis_oracle_pct double precision,
  ADD COLUMN IF NOT EXISTS basis_nbbo_pct double precision,
  ADD COLUMN IF NOT EXISTS basis_vwap_pct double precision,
  ADD COLUMN IF NOT EXISTS borrow_pct double precision,
  ADD COLUMN IF NOT EXISTS borrow_source text,
  ADD COLUMN IF NOT EXISTS max_leverage double precision;

CREATE TABLE IF NOT EXISTS equity_quotes (
  ticker text NOT NULL,
  ts timestamptz NOT NULL,
  bid double precision,
  ask double precision,
  mid double precision,
  last double precision,
  PRIMARY KEY (ticker, ts)
);
SELECT create_hypertable('equity_quotes', 'ts', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS equity_vwap (
  ticker text NOT NULL,
  d date NOT NULL,
  vwap double precision NOT NULL,
  PRIMARY KEY (ticker, d)
);

CREATE TABLE IF NOT EXISTS borrow_rates (
  ticker text NOT NULL,
  as_of date NOT NULL,
  fee_rate_pct double precision NOT NULL,
  source text NOT NULL DEFAULT 'ibkr_flex',
  raw jsonb,
  PRIMARY KEY (ticker, as_of, source)
);

CREATE TABLE IF NOT EXISTS margin_snapshots (
  ts timestamptz NOT NULL,
  address text NOT NULL,
  dex text NOT NULL DEFAULT '',
  account_value double precision,
  total_margin_used double precision,
  withdrawable double precision,
  positions jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (address, dex, ts)
);
SELECT create_hypertable('margin_snapshots', 'ts', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS hip3_dexs (
  name text PRIMARY KEY,
  deployer text,
  active boolean NOT NULL DEFAULT true,
  last_seen timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS markets_dex_idx ON markets (dex);
CREATE INDEX IF NOT EXISTS borrow_rates_ticker_asof_idx ON borrow_rates (ticker, as_of DESC);
