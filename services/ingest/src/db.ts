import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ||
        "postgresql://carryscan:carryscan@localhost:5432/carryscan",
      max: 8,
    });
  }
  return pool;
}

export type Market = {
  id: number;
  dex: string;
  coin: string;
  cash_ticker: string | null;
  ref_type: string;
  name: string;
  active: boolean;
};

export async function heartbeat(job: string, note?: string) {
  await getPool().query(
    `INSERT INTO ingest_heartbeat (job, last_ok, note)
     VALUES ($1, now(), $2)
     ON CONFLICT (job) DO UPDATE SET last_ok = EXCLUDED.last_ok, note = EXCLUDED.note`,
    [job, note ?? null],
  );
}

export async function loadMarkets(activeOnly = true): Promise<Market[]> {
  const q = activeOnly
    ? `SELECT * FROM markets WHERE active ORDER BY id`
    : `SELECT * FROM markets ORDER BY id`;
  const { rows } = await getPool().query(q);
  return rows;
}

export async function upsertFunding(
  marketId: number,
  rows: Array<[Date, number, number | null]>,
) {
  if (!rows.length) return 0;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    for (const [ts, rate, prem] of rows) {
      await client.query(
        `INSERT INTO funding_ticks (market_id, ts, rate, premium)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (market_id, ts) DO UPDATE
           SET rate = EXCLUDED.rate, premium = EXCLUDED.premium`,
        [marketId, ts, rate, prem],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return rows.length;
}

export async function upsertCandles(
  marketId: number,
  rows: Array<[Date, number, number, number, number]>,
) {
  if (!rows.length) return 0;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    for (const [ts, o, h, l, c] of rows) {
      await client.query(
        `INSERT INTO candles_1h (market_id, ts, o, h, l, c)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (market_id, ts) DO UPDATE
           SET o=EXCLUDED.o,h=EXCLUDED.h,l=EXCLUDED.l,c=EXCLUDED.c`,
        [marketId, ts, o, h, l, c],
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return rows.length;
}

export async function upsertCtx(
  marketId: number,
  ts: Date,
  mark: number | null,
  oracle: number | null,
  mid: number | null,
  oiBase: number | null,
  prevDayPx: number | null,
) {
  await getPool().query(
    `INSERT INTO ctx_snapshots (market_id, ts, mark, oracle, mid, oi_base, prev_day_px)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (market_id, ts) DO UPDATE SET
       mark=EXCLUDED.mark, oracle=EXCLUDED.oracle, mid=EXCLUDED.mid,
       oi_base=EXCLUDED.oi_base, prev_day_px=EXCLUDED.prev_day_px`,
    [marketId, ts, mark, oracle, mid, oiBase, prevDayPx],
  );
}

export async function lastFundingTs(marketId: number): Promise<Date | null> {
  const { rows } = await getPool().query(
    `SELECT max(ts) AS ts FROM funding_ticks WHERE market_id = $1`,
    [marketId],
  );
  return rows[0]?.ts ?? null;
}

export async function lastCandleTs(marketId: number): Promise<Date | null> {
  const { rows } = await getPool().query(
    `SELECT max(ts) AS ts FROM candles_1h WHERE market_id = $1`,
    [marketId],
  );
  return rows[0]?.ts ?? null;
}

export async function latestClose(ticker: string): Promise<number | null> {
  const { rows } = await getPool().query(
    `SELECT close FROM equity_closes WHERE ticker = $1 ORDER BY d DESC LIMIT 1`,
    [ticker],
  );
  return rows[0]?.close != null ? Number(rows[0].close) : null;
}

export async function fundingRates(
  marketId: number,
  since: Date,
): Promise<Array<[Date, number]>> {
  const { rows } = await getPool().query(
    `SELECT ts, rate FROM funding_ticks
     WHERE market_id = $1 AND ts >= $2 ORDER BY ts`,
    [marketId, since],
  );
  return rows.map((r) => [r.ts as Date, Number(r.rate)]);
}

export async function upsertMetricsLive(row: {
  market_id: number;
  as_of: Date;
  mark: number | null;
  basis_pct: number | null;
  basis_oracle_pct?: number | null;
  basis_nbbo_pct?: number | null;
  basis_vwap_pct?: number | null;
  borrow_pct?: number | null;
  borrow_source?: string | null;
  max_leverage?: number | null;
  apr_now: number;
  apr_1d: number;
  apr_7d: number;
  apr_30d: number;
  oi_usd: number | null;
  spark: number[];
}) {
  await getPool().query(
    `INSERT INTO market_metrics_live
       (market_id, as_of, mark, basis_pct, basis_oracle_pct, basis_nbbo_pct, basis_vwap_pct,
        borrow_pct, borrow_source, max_leverage,
        apr_now, apr_1d, apr_7d, apr_30d, oi_usd, spark)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
     ON CONFLICT (market_id) DO UPDATE SET
       as_of=EXCLUDED.as_of, mark=EXCLUDED.mark, basis_pct=EXCLUDED.basis_pct,
       basis_oracle_pct=EXCLUDED.basis_oracle_pct,
       basis_nbbo_pct=EXCLUDED.basis_nbbo_pct,
       basis_vwap_pct=EXCLUDED.basis_vwap_pct,
       borrow_pct=EXCLUDED.borrow_pct,
       borrow_source=EXCLUDED.borrow_source,
       max_leverage=EXCLUDED.max_leverage,
       apr_now=EXCLUDED.apr_now, apr_1d=EXCLUDED.apr_1d, apr_7d=EXCLUDED.apr_7d,
       apr_30d=EXCLUDED.apr_30d, oi_usd=EXCLUDED.oi_usd, spark=EXCLUDED.spark`,
    [
      row.market_id,
      row.as_of,
      row.mark,
      row.basis_pct,
      row.basis_oracle_pct ?? null,
      row.basis_nbbo_pct ?? null,
      row.basis_vwap_pct ?? null,
      row.borrow_pct ?? null,
      row.borrow_source ?? null,
      row.max_leverage ?? null,
      row.apr_now,
      row.apr_1d,
      row.apr_7d,
      row.apr_30d,
      row.oi_usd,
      JSON.stringify(row.spark),
    ],
  );
}

export async function latestBorrow(
  ticker: string,
): Promise<{ fee_rate_pct: number; source: string } | null> {
  const { rows } = await getPool().query(
    `SELECT fee_rate_pct, source FROM borrow_rates
     WHERE ticker = $1 ORDER BY as_of DESC LIMIT 1`,
    [ticker.toUpperCase()],
  );
  if (!rows[0]) return null;
  return {
    fee_rate_pct: Number(rows[0].fee_rate_pct),
    source: String(rows[0].source),
  };
}

export async function upsertQuote(
  ticker: string,
  ts: Date,
  bid: number | null,
  ask: number | null,
  mid: number | null,
  last: number | null,
) {
  await getPool().query(
    `INSERT INTO equity_quotes (ticker, ts, bid, ask, mid, last)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (ticker, ts) DO UPDATE SET
       bid=EXCLUDED.bid, ask=EXCLUDED.ask, mid=EXCLUDED.mid, last=EXCLUDED.last`,
    [ticker, ts, bid, ask, mid, last],
  );
}

export async function upsertVwap(ticker: string, d: string, vwap: number) {
  await getPool().query(
    `INSERT INTO equity_vwap (ticker, d, vwap) VALUES ($1,$2,$3)
     ON CONFLICT (ticker, d) DO UPDATE SET vwap = EXCLUDED.vwap`,
    [ticker, d, vwap],
  );
}

export async function latestVwap(ticker: string): Promise<number | null> {
  const { rows } = await getPool().query(
    `SELECT vwap FROM equity_vwap WHERE ticker = $1 ORDER BY d DESC LIMIT 1`,
    [ticker],
  );
  return rows[0]?.vwap != null ? Number(rows[0].vwap) : null;
}

export async function listActiveDexs(): Promise<string[]> {
  const { rows } = await getPool().query(
    `SELECT DISTINCT dex FROM markets WHERE active ORDER BY dex`,
  );
  const dexs = rows.map((r) => r.dex as string);
  return dexs.length ? dexs : ["xyz"];
}
