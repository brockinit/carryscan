"""BigQuery helpers with bytes-billed guardrail."""
from __future__ import annotations

import json
from datetime import date
from typing import Any, Sequence

from google.cloud import bigquery

from spy_lab.config import Settings, get_settings


class Bq:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()
        self.client = bigquery.Client(project=self.settings.gcp_project)

    def table_id(self, name: str) -> str:
        return f"{self.settings.gcp_project}.{self.settings.bq_dataset}.{name}"

    def query(self, sql: str, params: list | None = None) -> list[dict]:
        job_config = bigquery.QueryJobConfig(
            maximum_bytes_billed=self.settings.bq_maximum_bytes_billed,
            query_parameters=params or [],
        )
        job = self.client.query(sql, job_config=job_config)
        return [dict(row) for row in job.result()]

    def apply_ddl_file(self, path: str) -> None:
        sql = open(path).read()
        # Split on semicolons carefully — run whole file statements
        for stmt in sql.split(";"):
            s = stmt.strip()
            if not s or s.startswith("--"):
                continue
            self.client.query(s).result()

    def merge_underlying(self, rows: Sequence[dict]) -> int:
        if not rows:
            return 0
        table = self.table_id("underlying_daily")
        tmp = self.table_id("_tmp_underlying_daily")
        self._load_json_table(tmp, rows, write=bigquery.WriteDisposition.WRITE_TRUNCATE)
        sql = f"""
        MERGE `{table}` T
        USING `{tmp}` S
        ON T.as_of_date = CAST(S.as_of_date AS DATE) AND T.ticker = S.ticker
        WHEN MATCHED THEN UPDATE SET
          o=S.o, h=S.h, l=S.l, c=S.c, v=S.v,
          gap_pct=S.gap_pct, rel_vol_20=S.rel_vol_20, prior_er=S.prior_er, rv5=S.rv5,
          is_fomc=S.is_fomc, is_fomc_eve=S.is_fomc_eve, is_opex=S.is_opex,
          is_triple_witching=S.is_triple_witching, is_eom=S.is_eom, is_eoq=S.is_eoq,
          is_vix_opex=S.is_vix_opex, is_half_day=S.is_half_day,
          is_nfp=S.is_nfp, is_cpi=S.is_cpi, is_high_impact_macro=S.is_high_impact_macro,
          days_to_fomc=S.days_to_fomc, days_to_opex=S.days_to_opex,
          moc_imbalance_ratio=S.moc_imbalance_ratio,
          ingested_at=CURRENT_TIMESTAMP()
        WHEN NOT MATCHED THEN INSERT (
          as_of_date, ticker, o, h, l, c, v, gap_pct, rel_vol_20, prior_er, rv5,
          is_fomc, is_fomc_eve, is_opex, is_triple_witching, is_eom, is_eoq,
          is_vix_opex, is_half_day, is_nfp, is_cpi, is_high_impact_macro,
          days_to_fomc, days_to_opex, moc_imbalance_ratio
        ) VALUES (
          CAST(S.as_of_date AS DATE), S.ticker, S.o, S.h, S.l, S.c, S.v,
          S.gap_pct, S.rel_vol_20, S.prior_er, S.rv5,
          S.is_fomc, S.is_fomc_eve, S.is_opex, S.is_triple_witching, S.is_eom, S.is_eoq,
          S.is_vix_opex, S.is_half_day, S.is_nfp, S.is_cpi, S.is_high_impact_macro,
          S.days_to_fomc, S.days_to_opex, S.moc_imbalance_ratio
        )
        """
        self.client.query(sql).result()
        return len(rows)

    def merge_surfaces(self, rows: Sequence[dict]) -> int:
        if not rows:
            return 0
        table = self.table_id("option_surface_daily")
        tmp = self.table_id("_tmp_option_surface_daily")
        self._load_json_table(tmp, rows, write=bigquery.WriteDisposition.WRITE_TRUNCATE)
        sql = f"""
        MERGE `{table}` T
        USING `{tmp}` S
        ON T.as_of_date = CAST(S.as_of_date AS DATE)
         AND T.underlying = S.underlying
         AND T.dte_target = S.dte_target
        WHEN MATCHED THEN UPDATE SET
          spot=S.spot, dte_actual=S.dte_actual, expiry=CAST(S.expiry AS DATE),
          iv_atm=S.iv_atm, iv_25d_put=S.iv_25d_put, iv_25d_call=S.iv_25d_call,
          rr_25d=S.rr_25d, bf_25d=S.bf_25d, straddle_mid_atm=S.straddle_mid_atm,
          call_oi=S.call_oi, put_oi=S.put_oi, source=S.source,
          ingested_at=CURRENT_TIMESTAMP()
        WHEN NOT MATCHED THEN INSERT (
          as_of_date, underlying, spot, dte_target, dte_actual, expiry,
          iv_atm, iv_25d_put, iv_25d_call, rr_25d, bf_25d, straddle_mid_atm,
          call_oi, put_oi, source
        ) VALUES (
          CAST(S.as_of_date AS DATE), S.underlying, S.spot, S.dte_target, S.dte_actual,
          CAST(S.expiry AS DATE), S.iv_atm, S.iv_25d_put, S.iv_25d_call, S.rr_25d,
          S.bf_25d, S.straddle_mid_atm, S.call_oi, S.put_oi, S.source
        )
        """
        self.client.query(sql).result()
        return len(rows)

    def merge_events(self, rows: Sequence[dict]) -> int:
        if not rows:
            return 0
        # Normalize meta to JSON string
        norm = []
        for r in rows:
            n = dict(r)
            meta = n.get("meta")
            if isinstance(meta, dict):
                n["meta"] = json.dumps(meta)
            norm.append(n)
        table = self.table_id("market_events")
        tmp = self.table_id("_tmp_market_events")
        self._load_json_table(tmp, norm, write=bigquery.WriteDisposition.WRITE_TRUNCATE)
        # Delete overlapping keys then insert (simpler than merge with JSON)
        sql = f"""
        DELETE FROM `{table}` T
        WHERE EXISTS (
          SELECT 1 FROM `{tmp}` S
          WHERE T.as_of_date = CAST(S.as_of_date AS DATE)
            AND T.event_type = S.event_type
        );
        INSERT INTO `{table}` (as_of_date, event_type, severity, source, meta)
        SELECT CAST(as_of_date AS DATE), event_type, severity, source,
               PARSE_JSON(meta)
        FROM `{tmp}`
        """
        self.client.query(sql).result()
        return len(norm)

    def ingest_spy_day_from_gcs(self, as_of: date) -> int:
        """Load one full-market day file in-region, keep O:SPY* only.

        GCS → BigQuery load is free and does not leave Google. The laptop
        never downloads the gzip.
        """
        from spy_lab.gcs_day_aggs import day_gcs_uri

        uri = day_gcs_uri(as_of, self.settings)
        tmp = self.table_id("_tmp_option_day_aggs")
        job_config = bigquery.LoadJobConfig(
            source_format=bigquery.SourceFormat.CSV,
            skip_leading_rows=1,
            write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
            schema=[
                bigquery.SchemaField("ticker", "STRING"),
                bigquery.SchemaField("volume", "FLOAT64"),
                bigquery.SchemaField("open", "FLOAT64"),
                bigquery.SchemaField("close", "FLOAT64"),
                bigquery.SchemaField("high", "FLOAT64"),
                bigquery.SchemaField("low", "FLOAT64"),
                bigquery.SchemaField("window_start", "INT64"),
                bigquery.SchemaField("transactions", "INT64"),
            ],
        )
        self.client.load_table_from_uri(uri, tmp, job_config=job_config).result()
        return self._insert_spy_from_day_aggs_tmp(tmp, as_of)

    def _insert_spy_from_day_aggs_tmp(self, tmp: str, as_of: date) -> int:
        table = self.table_id("spy_option_day")
        # Filter query scans one loaded day (not the laptop). Cap above default
        # in case a busy session's uncompressed CSV is large.
        job_config = bigquery.QueryJobConfig(
            maximum_bytes_billed=max(
                self.settings.bq_maximum_bytes_billed, 50 * 1024**3
            ),
            query_parameters=[
                bigquery.ScalarQueryParameter("d", "DATE", as_of.isoformat())
            ],
        )
        self.client.query(
            f"DELETE FROM `{table}` WHERE as_of_date = @d",
            job_config=job_config,
        ).result()
        sql = f"""
        INSERT INTO `{table}` (
          as_of_date, ticker, root, expiry, cp, strike, o, h, l, c, v, transactions
        )
        SELECT
          @d,
          ticker,
          'SPY',
          PARSE_DATE('%y%m%d', REGEXP_EXTRACT(ticker, r'^O:SPY(\\d{{6}})')),
          REGEXP_EXTRACT(ticker, r'^O:SPY\\d{{6}}([CP])'),
          CAST(REGEXP_EXTRACT(ticker, r'^O:SPY\\d{{6}}[CP](\\d{{8}})$') AS INT64) / 1000.0,
          open, high, low, close, volume, transactions
        FROM `{tmp}`
        WHERE REGEXP_CONTAINS(ticker, r'^O:SPY\\d{{6}}[CP]\\d{{8}}$')
        """
        job = self.client.query(sql, job_config=job_config)
        job.result()
        return int(job.num_dml_affected_rows or 0)

    def fetch_spy_option_day(self, as_of: date) -> list[dict]:
        table = self.table_id("spy_option_day")
        rows = self.query(
            f"""
            SELECT ticker, root, expiry, cp, strike, o, h, l, c, v, transactions, iv, delta
            FROM `{table}`
            WHERE as_of_date = @d
            """,
            params=[
                bigquery.ScalarQueryParameter("d", "DATE", as_of.isoformat())
            ],
        )
        out = []
        for r in rows:
            rec = dict(r)
            rec["close"] = rec.get("c")
            rec["volume"] = rec.get("v")
            rec["open"] = rec.get("o")
            rec["high"] = rec.get("h")
            rec["low"] = rec.get("l")
            out.append(rec)
        return out

    def load_spy_option_day(self, rows: Sequence[dict], as_of: date) -> int:
        if not rows:
            return 0
        table = self.table_id("spy_option_day")
        # delete day then insert
        self.client.query(
            f"DELETE FROM `{table}` WHERE as_of_date = @d",
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("d", "DATE", as_of.isoformat())
                ]
            ),
        ).result()
        tmp = self.table_id("_tmp_spy_option_day")
        self._load_json_table(tmp, rows, write=bigquery.WriteDisposition.WRITE_TRUNCATE)
        sql = f"""
        INSERT INTO `{table}` (
          as_of_date, ticker, root, expiry, cp, strike, o, h, l, c, v, transactions, iv, delta
        )
        SELECT CAST(as_of_date AS DATE), ticker, root, CAST(expiry AS DATE), cp, strike,
               o, h, l, c, v, transactions, iv, delta
        FROM `{tmp}`
        """
        self.client.query(sql).result()
        return len(rows)

    def checkpoint(self, job: str, key: str, status: str, detail: str = "") -> None:
        table = self.table_id("etl_checkpoints")
        sql = f"""
        DELETE FROM `{table}` WHERE job=@j AND checkpoint_key=@k;
        INSERT INTO `{table}` (job, checkpoint_key, status, detail, updated_at)
        VALUES (@j, @k, @s, @d, CURRENT_TIMESTAMP())
        """
        self.client.query(
            sql,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("j", "STRING", job),
                    bigquery.ScalarQueryParameter("k", "STRING", key),
                    bigquery.ScalarQueryParameter("s", "STRING", status),
                    bigquery.ScalarQueryParameter("d", "STRING", detail),
                ]
            ),
        ).result()

    def get_checkpoint(self, job: str, key: str) -> str | None:
        table = self.table_id("etl_checkpoints")
        job_q = self.client.query(
            f"SELECT status FROM `{table}` WHERE job=@j AND checkpoint_key=@k LIMIT 1",
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("j", "STRING", job),
                    bigquery.ScalarQueryParameter("k", "STRING", key),
                ]
            ),
        )
        for row in job_q.result():
            return row["status"]
        return None

    def fetch_panel(self, start: date, end: date) -> list[dict]:
        """Join underlying + 30d surface for backtests."""
        sql = f"""
        SELECT
          u.*,
          s.iv_atm, s.iv_25d_put, s.iv_25d_call, s.rr_25d, s.bf_25d,
          s.straddle_mid_atm, s.dte_actual
        FROM `{self.table_id("underlying_daily")}` u
        LEFT JOIN `{self.table_id("option_surface_daily")}` s
          ON u.as_of_date = s.as_of_date
         AND s.underlying = u.ticker
         AND s.dte_target = 30
        WHERE u.as_of_date BETWEEN @a AND @b
        ORDER BY u.as_of_date
        """
        job = self.client.query(
            sql,
            job_config=bigquery.QueryJobConfig(
                maximum_bytes_billed=self.settings.bq_maximum_bytes_billed,
                query_parameters=[
                    bigquery.ScalarQueryParameter("a", "DATE", start.isoformat()),
                    bigquery.ScalarQueryParameter("b", "DATE", end.isoformat()),
                ],
            ),
        )
        return [dict(r) for r in job.result()]

    def upsert_ledger(self, row: dict) -> None:
        table = self.table_id("experiment_ledger")
        tmp = self.table_id("_tmp_experiment_ledger")
        payload = dict(row)
        if isinstance(payload.get("spec_json"), dict):
            payload["spec_json"] = json.dumps(payload["spec_json"])
        self._load_json_table(
            tmp, [payload], write=bigquery.WriteDisposition.WRITE_TRUNCATE
        )
        sql = f"""
        DELETE FROM `{table}` WHERE id = (SELECT id FROM `{tmp}` LIMIT 1);
        INSERT INTO `{table}` (
          id, title, spec_json, verdict, primary_metric, n_trades,
          train_metric, test_metric, kill_reason, created_at, updated_at
        )
        SELECT id, title, PARSE_JSON(spec_json), verdict, primary_metric, n_trades,
               train_metric, test_metric, kill_reason,
               CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()
        FROM `{tmp}`
        """
        self.client.query(sql).result()

    def insert_run(self, row: dict) -> None:
        table = self.table_id("experiment_runs")
        tmp = self.table_id("_tmp_experiment_runs")
        payload = dict(row)
        if isinstance(payload.get("metrics_json"), dict):
            payload["metrics_json"] = json.dumps(payload["metrics_json"])
        self._load_json_table(
            tmp, [payload], write=bigquery.WriteDisposition.WRITE_TRUNCATE
        )
        sql = f"""
        INSERT INTO `{table}` (
          run_id, experiment_id, spec_hash, train_start, train_end,
          test_start, test_end, metrics_json, verdict, created_at
        )
        SELECT run_id, experiment_id, spec_hash,
               CAST(train_start AS DATE), CAST(train_end AS DATE),
               CAST(test_start AS DATE), CAST(test_end AS DATE),
               PARSE_JSON(metrics_json), verdict, CURRENT_TIMESTAMP()
        FROM `{tmp}`
        """
        self.client.query(sql).result()

    def _load_json_table(
        self,
        table_id: str,
        rows: Sequence[dict],
        write: str = bigquery.WriteDisposition.WRITE_TRUNCATE,
    ) -> None:
        import tempfile
        import os

        with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False) as f:
            for r in rows:
                f.write(json.dumps(r, default=str) + "\n")
            path = f.name
        try:
            job_config = bigquery.LoadJobConfig(
                source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
                autodetect=True,
                write_disposition=write,
            )
            with open(path, "rb") as fh:
                self.client.load_table_from_file(
                    fh, table_id, job_config=job_config
                ).result()
        finally:
            os.unlink(path)

    def apply_event_flags(self, start: date, end: date) -> None:
        """Recompute denormalized event flags on underlying_daily from market_events."""
        u = self.table_id("underlying_daily")
        e = self.table_id("market_events")
        sql = f"""
        UPDATE `{u}` u
        SET
          is_fomc = EXISTS(SELECT 1 FROM `{e}` e WHERE e.as_of_date=u.as_of_date AND e.event_type='fomc'),
          is_fomc_eve = EXISTS(SELECT 1 FROM `{e}` e WHERE e.as_of_date=u.as_of_date AND e.event_type='fomc_day_before'),
          is_opex = EXISTS(SELECT 1 FROM `{e}` e WHERE e.as_of_date=u.as_of_date AND e.event_type IN ('opex','triple_witching')),
          is_triple_witching = EXISTS(SELECT 1 FROM `{e}` e WHERE e.as_of_date=u.as_of_date AND e.event_type='triple_witching'),
          is_eom = EXISTS(SELECT 1 FROM `{e}` e WHERE e.as_of_date=u.as_of_date AND e.event_type='eom'),
          is_eoq = EXISTS(SELECT 1 FROM `{e}` e WHERE e.as_of_date=u.as_of_date AND e.event_type='eoq'),
          is_vix_opex = EXISTS(SELECT 1 FROM `{e}` e WHERE e.as_of_date=u.as_of_date AND e.event_type='vix_opex'),
          is_half_day = EXISTS(SELECT 1 FROM `{e}` e WHERE e.as_of_date=u.as_of_date AND e.event_type='half_day'),
          is_nfp = EXISTS(SELECT 1 FROM `{e}` e WHERE e.as_of_date=u.as_of_date AND e.event_type='nfp'),
          is_cpi = EXISTS(SELECT 1 FROM `{e}` e WHERE e.as_of_date=u.as_of_date AND e.event_type IN ('cpi','core_cpi')),
          is_high_impact_macro = EXISTS(
            SELECT 1 FROM `{e}` e
            WHERE e.as_of_date=u.as_of_date
              AND e.event_type IN ('high_impact_macro','nfp','cpi','core_cpi','fomc','pce','gdp')
          )
        WHERE u.as_of_date BETWEEN @a AND @b
        """
        self.client.query(
            sql,
            job_config=bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("a", "DATE", start.isoformat()),
                    bigquery.ScalarQueryParameter("b", "DATE", end.isoformat()),
                ]
            ),
        ).result()
