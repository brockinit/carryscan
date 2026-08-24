-- Trader copilot: journal, behaviors, live tape, character, flow, briefs

CREATE TABLE IF NOT EXISTS trades (
  id bigserial PRIMARY KEY,
  ticker text NOT NULL,
  structure text,
  side text,
  size double precision,
  entry double precision,
  exit double precision,
  tags text[] NOT NULL DEFAULT '{}',
  thesis text,
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id bigserial PRIMARY KEY,
  trade_id bigint REFERENCES trades(id),
  as_of date NOT NULL DEFAULT CURRENT_DATE,
  body text NOT NULL,
  setup text,
  emotion text,
  rule_followed boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_reviews (
  id bigserial PRIMARY KEY,
  as_of date NOT NULL UNIQUE,
  draft text,
  approved text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);

CREATE TABLE IF NOT EXISTS playbook_rules (
  id text PRIMARY KEY,
  version int NOT NULL DEFAULT 1,
  body text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS playbook_rule_versions (
  id text NOT NULL,
  version int NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS behaviors (
  id text PRIMARY KEY,
  title text NOT NULL,
  trigger jsonb NOT NULL DEFAULT '{}'::jsonb,
  expected text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'promoted', 'demoted')),
  linked_spec_id text,
  evidence jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback_events (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  rating smallint,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memory_chunks (
  id bigserial PRIMARY KEY,
  source_type text NOT NULL,
  source_id text NOT NULL,
  body text NOT NULL,
  embedding double precision[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS option_prints (
  ticker text NOT NULL,
  occ text NOT NULL,
  ts timestamptz NOT NULL,
  price double precision,
  size double precision,
  premium double precision,
  notable boolean NOT NULL DEFAULT false,
  PRIMARY KEY (occ, ts)
);
SELECT create_hypertable('option_prints', 'ts', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS option_print_rollups (
  ticker text NOT NULL,
  bucket timestamptz NOT NULL,
  n_prints int NOT NULL DEFAULT 0,
  sum_premium double precision NOT NULL DEFAULT 0,
  PRIMARY KEY (ticker, bucket)
);

CREATE TABLE IF NOT EXISTS gex_snapshots (
  ticker text NOT NULL,
  ts timestamptz NOT NULL,
  spot double precision,
  net_gex double precision,
  call_wall double precision,
  put_wall double precision,
  max_gex_strike double precision,
  gamma_sign text,
  by_strike jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (ticker, ts)
);
SELECT create_hypertable('gex_snapshots', 'ts', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS session_features (
  ticker text NOT NULL,
  ts timestamptz NOT NULL,
  vix double precision,
  rel_vol double precision,
  session_volume double precision,
  range_vs_open15 double precision,
  clock text,
  extras jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (ticker, ts)
);
SELECT create_hypertable('session_features', 'ts', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS underlying_minutes (
  ticker text NOT NULL,
  ts timestamptz NOT NULL,
  o double precision,
  h double precision,
  l double precision,
  c double precision,
  v double precision,
  PRIMARY KEY (ticker, ts)
);
SELECT create_hypertable('underlying_minutes', 'ts', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS character_snapshots (
  ticker text NOT NULL,
  ts timestamptz NOT NULL,
  label text NOT NULL,
  trend_vs_balance double precision,
  follow_vs_fade double precision,
  vol_texture double precision,
  flipped boolean NOT NULL DEFAULT false,
  prior_label text,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  apply_strategies text[] NOT NULL DEFAULT '{}',
  avoid_strategies text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (ticker, ts)
);
SELECT create_hypertable('character_snapshots', 'ts', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS level_reactions (
  ticker text NOT NULL,
  level_name text NOT NULL,
  character_label text NOT NULL,
  n int NOT NULL DEFAULT 0,
  hold_n int NOT NULL DEFAULT 0,
  reject_n int NOT NULL DEFAULT 0,
  through_n int NOT NULL DEFAULT 0,
  median_follow_through double precision,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, level_name, character_label)
);

CREATE TABLE IF NOT EXISTS flow_daily (
  ticker text NOT NULL,
  as_of date NOT NULL,
  stock_volume double precision,
  rel_vol_20 double precision,
  ad_line double precision,
  call_oi_change double precision,
  put_oi_change double precision,
  unusual_premium double precision,
  put_call double precision,
  note text,
  extras jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (ticker, as_of)
);

CREATE TABLE IF NOT EXISTS flow_weekly (
  ticker text NOT NULL,
  week_of date NOT NULL,
  stock_volume double precision,
  ad_line double precision,
  call_oi_change double precision,
  put_oi_change double precision,
  unusual_premium double precision,
  note text,
  extras jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (ticker, week_of)
);

CREATE TABLE IF NOT EXISTS session_briefs (
  as_of date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('preopen', 'postclose')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (as_of, kind)
);

CREATE TABLE IF NOT EXISTS copilot_messages (
  id bigserial PRIMARY KEY,
  role text NOT NULL,
  body text NOT NULL,
  tool_trace jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journal_entries_asof_idx ON journal_entries (as_of DESC);
CREATE INDEX IF NOT EXISTS behaviors_status_idx ON behaviors (status);
CREATE INDEX IF NOT EXISTS memory_chunks_source_idx ON memory_chunks (source_type, source_id);
CREATE INDEX IF NOT EXISTS option_prints_ticker_ts_idx ON option_prints (ticker, ts DESC);
CREATE INDEX IF NOT EXISTS gex_snapshots_ticker_ts_idx ON gex_snapshots (ticker, ts DESC);

INSERT INTO playbook_rules (id, version, body) VALUES
  ('apply_avoid_balance', 1, 'Balance character: apply fade_edges / mean_revert_vwap. Avoid breakout_chase and fading the first break.'),
  ('apply_avoid_trend', 1, 'Trend character: apply pullbacks_in_direction. Avoid fade_first_break and fade_edges.'),
  ('flow_is_inferred', 1, 'Never describe OI or volume builds as institutional. Say inferred.')
ON CONFLICT (id) DO NOTHING;
