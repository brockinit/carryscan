import { HLClient, num } from "../hl.js";
import {
  heartbeat,
  lastCandleTs,
  loadMarkets,
  upsertCandles,
} from "../db.js";

const DEFAULT_LOOKBACK_DAYS = 120;

export async function run(
  hl?: HLClient,
  full = false,
  days = DEFAULT_LOOKBACK_DAYS,
) {
  const client = hl ?? new HLClient();
  const endMs = Date.now();
  const markets = await loadMarkets();
  let total = 0;
  for (const m of markets) {
    const last = full ? null : await lastCandleTs(m.id);
    const start = last
      ? last
      : new Date(Date.now() - days * 86400 * 1000);
    const raw = (await client.candleSnapshot(
      m.coin,
      start.getTime(),
      endMs,
      "1h",
    )) || [];
    const rows: Array<[Date, number, number, number, number]> = [];
    for (const c of raw) {
      const o = num(c.o);
      const h = num(c.h);
      const l = num(c.l);
      const cl = num(c.c);
      if (o == null || h == null || l == null || cl == null) continue;
      rows.push([new Date(Number(c.t)), o, h, l, cl]);
    }
    const n = await upsertCandles(m.id, rows);
    total += n;
    console.log(JSON.stringify({ msg: "candles", coin: m.coin, n }));
  }
  await heartbeat("candles", `+${total}`);
  console.log(JSON.stringify({ msg: "candles ok", total }));
}
