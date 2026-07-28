import { getPool, heartbeat } from "../db.js";
import { MassiveClient } from "../massive.js";

export async function run() {
  const client = new MassiveClient();
  const rows = client.loadEarningsCsv();
  const pool = getPool();
  for (const r of rows) {
    await pool.query(
      `INSERT INTO earnings (ticker, print_date, session)
       VALUES ($1,$2,$3)
       ON CONFLICT (ticker, print_date) DO UPDATE SET session = EXCLUDED.session`,
      [r.ticker, r.print_date, r.session],
    );
  }
  await heartbeat("earnings_refresh", `${rows.length} from csv`);
  console.log(JSON.stringify({ msg: "earnings ok", n: rows.length }));
}
