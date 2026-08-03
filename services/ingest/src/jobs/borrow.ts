import { IbkrFlexClient } from "../ibkr.js";
import { getPool, heartbeat } from "../db.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Pull IBKR Flex borrow fees; optional CSV blotter at BORROW_CSV. */
export async function run() {
  const pool = getPool();
  let n = 0;

  const flex = new IbkrFlexClient();
  if (flex.enabled) {
    try {
      const rows = await flex.fetchBorrowFees();
      for (const r of rows) {
        await pool.query(
          `INSERT INTO borrow_rates (ticker, as_of, fee_rate_pct, source, raw)
           VALUES ($1,$2,$3,'ibkr_flex',$4::jsonb)
           ON CONFLICT (ticker, as_of, source) DO UPDATE SET
             fee_rate_pct = EXCLUDED.fee_rate_pct,
             raw = EXCLUDED.raw`,
          [r.ticker, r.as_of, r.fee_rate_pct, JSON.stringify(r.raw)],
        );
        n++;
      }
      console.log(JSON.stringify({ msg: "borrow flex", n: rows.length }));
    } catch (e) {
      console.error(JSON.stringify({ msg: "borrow flex failed", err: String(e) }));
    }
  }

  const csvPath = process.env.BORROW_CSV;
  if (csvPath) {
    try {
      n += await loadCsv(csvPath);
    } catch (e) {
      console.error(JSON.stringify({ msg: "borrow csv failed", err: String(e) }));
    }
  } else {
    // optional default blotter
    for (const p of [
      resolve(process.cwd(), "db/seed/borrow.csv"),
      "/app/db/seed/borrow.csv",
    ]) {
      try {
        readFileSync(p);
        n += await loadCsv(p);
        break;
      } catch {
        /* next */
      }
    }
  }

  await heartbeat("borrow", `+${n} rates`);
  console.log(JSON.stringify({ msg: "borrow ok", n }));
}

async function loadCsv(path: string): Promise<number> {
  const text = readFileSync(path, "utf8");
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return 0;
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const ti = header.indexOf("ticker");
  const ri = header.indexOf("fee_rate_pct") >= 0
    ? header.indexOf("fee_rate_pct")
    : header.indexOf("rate");
  const di = header.indexOf("as_of") >= 0 ? header.indexOf("as_of") : header.indexOf("date");
  if (ti < 0 || ri < 0) throw new Error("borrow.csv needs ticker,fee_rate_pct[,as_of]");
  const pool = getPool();
  let n = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const line of lines.slice(1)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const cols = trimmed.split(",");
    const ticker = cols[ti]?.trim().toUpperCase();
    const fee = Number(cols[ri]);
    const asOf = (di >= 0 ? cols[di]?.trim() : today) || today;
    if (!ticker || !Number.isFinite(fee)) continue;
    await pool.query(
      `INSERT INTO borrow_rates (ticker, as_of, fee_rate_pct, source, raw)
       VALUES ($1,$2,$3,'csv',NULL)
       ON CONFLICT (ticker, as_of, source) DO UPDATE SET fee_rate_pct = EXCLUDED.fee_rate_pct`,
      [ticker, asOf, fee],
    );
    n++;
  }
  console.log(JSON.stringify({ msg: "borrow csv", path, n }));
  return n;
}
