import { getPool, heartbeat, loadMarkets } from "../db.js";
import { MassiveClient } from "../massive.js";

export async function run(lookbackDays = 180) {
  const client = new MassiveClient();
  const to = new Date();
  const from = new Date(Date.now() - lookbackDays * 86400 * 1000);
  const toD = to.toISOString().slice(0, 10);
  const fromD = from.toISOString().slice(0, 10);

  const markets = await loadMarkets();
  const tickers = [
    ...new Set(
      markets.map((m) => m.cash_ticker).filter((t): t is string => Boolean(t)),
    ),
  ].sort();

  let total = 0;
  const pool = getPool();
  for (const ticker of tickers) {
    const bars = await client.dailyBars(ticker, fromD, toD);
    for (const b of bars) {
      const d = new Date(b.t).toISOString().slice(0, 10);
      await pool.query(
        `INSERT INTO equity_closes (ticker, d, open, close)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (ticker, d) DO UPDATE
           SET open = EXCLUDED.open, close = EXCLUDED.close`,
        [ticker, d, b.o, b.c],
      );
      total++;
    }
    console.log(JSON.stringify({ msg: "closes", ticker, n: bars.length }));
  }
  await heartbeat("closes", `+${total}`);
  console.log(JSON.stringify({ msg: "closes ok", total }));
}
