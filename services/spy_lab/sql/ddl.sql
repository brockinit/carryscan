-- SPY Edge Factory — BigQuery DDL (project: goldman-hax, dataset: options_lab)
-- Apply: bq query --use_legacy_sql=false < sql/ddl.sql
-- Or: python -m spy_lab.cli init-bq

CREATE SCHEMA IF NOT EXISTS `goldman-hax.options_lab`
OPTIONS(location="US");

CREATE TABLE IF NOT EXISTS `goldman-hax.options_lab.underlying_daily` (
  as_of_date DATE NOT NULL,
  ticker STRING NOT NULL,
  o FLOAT64,
  h FLOAT64,
  l FLOAT64,
  c FLOAT64,
  v FLOAT64,
  gap_pct FLOAT64,
  rel_vol_20 FLOAT64,
  prior_er FLOAT64,
  rv5 FLOAT64,
  is_fomc BOOL,
  is_fomc_eve BOOL,
  is_opex BOOL,
  is_triple_witching BOOL,
  is_eom BOOL,
  is_eoq BOOL,
  is_vix_opex BOOL,
  is_half_day BOOL,
  is_nfp BOOL,
  is_cpi BOOL,
  is_high_impact_macro BOOL,
  days_to_fomc INT64,
  days_to_opex INT64,
  moc_imbalance_ratio FLOAT64,
  ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY as_of_date
CLUSTER BY ticker;

CREATE TABLE IF NOT EXISTS `goldman-hax.options_lab.option_surface_daily` (
  as_of_date DATE NOT NULL,
  underlying STRING NOT NULL,
  spot FLOAT64,
  dte_target INT64 NOT NULL,
  dte_actual INT64,
  expiry DATE,
  iv_atm FLOAT64,
  iv_25d_put FLOAT64,
  iv_25d_call FLOAT64,
  rr_25d FLOAT64,
  bf_25d FLOAT64,
  straddle_mid_atm FLOAT64,
  call_oi INT64,
  put_oi INT64,
  source STRING,
  ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY as_of_date
CLUSTER BY underlying, dte_target;

CREATE TABLE IF NOT EXISTS `goldman-hax.options_lab.spy_option_day` (
  as_of_date DATE NOT NULL,
  ticker STRING NOT NULL,
  root STRING,
  expiry DATE,
  cp STRING,
  strike FLOAT64,
  o FLOAT64,
  h FLOAT64,
  l FLOAT64,
  c FLOAT64,
  v FLOAT64,
  transactions INT64,
  iv FLOAT64,
  delta FLOAT64,
  ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY as_of_date
CLUSTER BY expiry, cp;

CREATE TABLE IF NOT EXISTS `goldman-hax.options_lab.market_events` (
  as_of_date DATE NOT NULL,
  event_type STRING NOT NULL,
  severity STRING,
  source STRING,
  meta JSON,
  ingested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY as_of_date
CLUSTER BY event_type;

CREATE TABLE IF NOT EXISTS `goldman-hax.options_lab.etl_checkpoints` (
  job STRING NOT NULL,
  checkpoint_key STRING NOT NULL,
  status STRING,
  detail STRING,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS `goldman-hax.options_lab.experiment_ledger` (
  id STRING NOT NULL,
  title STRING,
  spec_json JSON,
  verdict STRING,
  primary_metric FLOAT64,
  n_trades INT64,
  train_metric FLOAT64,
  test_metric FLOAT64,
  kill_reason STRING,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS `goldman-hax.options_lab.experiment_runs` (
  run_id STRING NOT NULL,
  experiment_id STRING NOT NULL,
  spec_hash STRING,
  train_start DATE,
  train_end DATE,
  test_start DATE,
  test_end DATE,
  metrics_json JSON,
  verdict STRING,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
);

-- Idempotent adds for tables created before FMP macro flags
ALTER TABLE `goldman-hax.options_lab.underlying_daily`
  ADD COLUMN IF NOT EXISTS is_nfp BOOL;
ALTER TABLE `goldman-hax.options_lab.underlying_daily`
  ADD COLUMN IF NOT EXISTS is_cpi BOOL;
ALTER TABLE `goldman-hax.options_lab.underlying_daily`
  ADD COLUMN IF NOT EXISTS is_high_impact_macro BOOL;
