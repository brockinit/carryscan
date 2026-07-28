import { HLClient, num } from "../hl.js";
import {
  heartbeat,
  lastFundingTs,
  loadMarkets,
  upsertFunding,
} from "../db.js";

const DEFAULT_START = new Date("2025-06-01T00:00:00Z");

export async function run(hl?: HLClient, full = false) {
  const client = hl ?? new HLClient();
  const markets = await loadMarkets();
  let total = 0;
  for (const m of markets) {
    const last = full ? null : await lastFundingTs(m.id);
    const start = last
      ? new Date(last.getTime() + 1000)
      : DEFAULT_START;
    const rowsRaw = await client.fundingHistoryPaged(
      m.coin,
      start.getTime(),
      Date.now(),
    );
    const rows: Array<[Date, number, number | null]> = [];
    for (const row of rowsRaw) {
      const rate = num(row.fundingRate);
      if (rate == null) continue;
      rows.push([
        new Date(Number(row.time)),
        rate,
        num(row.premium),
      ]);
    }
    const n = await upsertFunding(m.id, rows);
    total += n;
    console.log(JSON.stringify({ msg: "funding", coin: m.coin, n }));
  }
  await heartbeat("funding", `+${total} ticks`);
  console.log(JSON.stringify({ msg: "funding ok", total }));
}
