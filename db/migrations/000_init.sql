CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE markets (
  id serial PRIMARY KEY,
  dex text NOT NULL DEFAULT 'xyz',
  coin text UNIQUE NOT NULL,
  cash_ticker text,
  ref_type text NOT NULL CHECK (ref_type IN ('stock','etf_proxy','none')),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE funding_ticks (
  market_id int REFERENCES markets(id),
  ts timestamptz NOT NULL,
  rate double precision NOT NULL,
  premium double precision,
  PRIMARY KEY (market_id, ts)
);
SELECT create_hypertable('funding_ticks','ts');

CREATE TABLE ctx_snapshots (
  market_id int REFERENCES markets(id),
  ts timestamptz NOT NULL,
  mark double precision,
  oracle double precision,
  mid double precision,
  oi_base double precision,
  prev_day_px double precision,
  PRIMARY KEY (market_id, ts)
);
SELECT create_hypertable('ctx_snapshots','ts');

CREATE TABLE candles_1h (
  market_id int REFERENCES markets(id),
  ts timestamptz NOT NULL,
  o double precision,
  h double precision,
  l double precision,
  c double precision,
  PRIMARY KEY (market_id, ts)
);
SELECT create_hypertable('candles_1h','ts');

CREATE TABLE equity_closes (
  ticker text NOT NULL,
  d date NOT NULL,
  open double precision,
  close double precision,
  PRIMARY KEY (ticker, d)
);

CREATE TABLE earnings (
  ticker text NOT NULL,
  print_date date NOT NULL,
  session text CHECK (session IN ('amc','bmo','tbd')),
  PRIMARY KEY (ticker, print_date)
);

CREATE TABLE market_metrics_live (
  market_id int PRIMARY KEY REFERENCES markets(id),
  as_of timestamptz NOT NULL,
  mark double precision,
  basis_pct double precision,
  apr_now double precision,
  apr_1d double precision,
  apr_7d double precision,
  apr_30d double precision,
  oi_usd double precision,
  spark jsonb
);

CREATE TABLE heatmap_cells (
  market_id int REFERENCES markets(id),
  dow smallint,
  hour smallint,
  apr double precision,
  PRIMARY KEY (market_id, dow, hour)
);

CREATE TABLE weekend_gaps (
  market_id int REFERENCES markets(id),
  weekend_start date,
  perp_drift double precision,
  cash_gap double precision,
  short_mae double precision,
  funding_banked double precision,
  PRIMARY KEY (market_id, weekend_start)
);

CREATE TABLE earnings_windows (
  market_id int REFERENCES markets(id),
  print_date date,
  window_avg double precision,
  delta_vs_baseline double precision,
  peak_basis double precision,
  PRIMARY KEY (market_id, print_date)
);

CREATE TABLE ingest_heartbeat (
  job text PRIMARY KEY,
  last_ok timestamptz NOT NULL,
  note text
);

INSERT INTO markets (coin, cash_ticker, ref_type, name) VALUES
  ('xyz:SPCX',  'SPCX',  'stock',     'SpaceX Corp'),
  ('xyz:TSLA',  'TSLA',  'stock',     'Tesla Inc'),
  ('xyz:NVDA',  'NVDA',  'stock',     'NVIDIA Corp'),
  ('xyz:MSTR',  'MSTR',  'stock',     'Strategy Inc'),
  ('xyz:HOOD',  'HOOD',  'stock',     'Robinhood Markets'),
  ('xyz:COIN',  'COIN',  'stock',     'Coinbase Global'),
  ('xyz:PLTR',  'PLTR',  'stock',     'Palantir Technologies'),
  ('xyz:AMD',   'AMD',   'stock',     'Advanced Micro Devices'),
  ('xyz:AAPL',  'AAPL',  'stock',     'Apple Inc'),
  ('xyz:MSFT',  'MSFT',  'stock',     'Microsoft Corp'),
  ('xyz:META',  'META',  'stock',     'Meta Platforms'),
  ('xyz:AMZN',  'AMZN',  'stock',     'Amazon.com'),
  ('xyz:GOOGL', 'GOOGL', 'stock',     'Alphabet Inc'),
  ('xyz:XYZ100','QQQ',   'etf_proxy', 'Top-100 index');
