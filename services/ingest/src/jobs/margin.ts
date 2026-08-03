import { HLClient, num } from "../hl.js";
import { getPool, heartbeat } from "../db.js";

export type PositionRisk = {
  coin: string;
  szi: number;
  entry_px: number | null;
  mark?: number | null;
  liquidation_px: number | null;
  margin_used: number | null;
  distance_pct: number | null;
  leverage: number | null;
};

/** Snapshot clearinghouseState for HL_WATCH_ADDRESS across HIP-3 dexs. */
export async function run(hl?: HLClient) {
  const address = process.env.HL_WATCH_ADDRESS?.trim();
  if (!address) {
    await heartbeat("margin", "HL_WATCH_ADDRESS unset");
    console.log(JSON.stringify({ msg: "margin skip", reason: "no address" }));
    return;
  }

  const client = hl ?? new HLClient();
  const pool = getPool();
  const { rows: dexRows } = await pool.query(
    `SELECT name FROM hip3_dexs WHERE active ORDER BY name`,
  );
  let dexs = dexRows.map((r) => r.name as string);
  if (!dexs.length) dexs = ["xyz"];

  const now = new Date();
  let posCount = 0;

  for (const dex of dexs) {
    const state = (await client.clearinghouseState(address, dex)) as {
      marginSummary?: {
        accountValue?: string;
        totalMarginUsed?: string;
      };
      withdrawable?: string;
      assetPositions?: Array<{
        position?: {
          coin?: string;
          szi?: string;
          entryPx?: string;
          liquidationPx?: string | null;
          marginUsed?: string;
          positionValue?: string;
          leverage?: { value?: number };
        };
      }>;
    };

    const positions: PositionRisk[] = [];
    for (const ap of state.assetPositions || []) {
      const p = ap.position;
      if (!p?.coin) continue;
      const szi = num(p.szi) ?? 0;
      if (szi === 0) continue;
      const liq = p.liquidationPx == null ? null : num(p.liquidationPx);
      const entry = num(p.entryPx);
      // distance: for short (szi<0), mark rising toward liq is bad — filled later with mark in API
      positions.push({
        coin: p.coin,
        szi,
        entry_px: entry,
        liquidation_px: liq,
        margin_used: num(p.marginUsed),
        distance_pct: null,
        leverage: p.leverage?.value ?? null,
      });
    }
    posCount += positions.length;

    await pool.query(
      `INSERT INTO margin_snapshots
         (ts, address, dex, account_value, total_margin_used, withdrawable, positions)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       ON CONFLICT (address, dex, ts) DO UPDATE SET
         account_value = EXCLUDED.account_value,
         total_margin_used = EXCLUDED.total_margin_used,
         withdrawable = EXCLUDED.withdrawable,
         positions = EXCLUDED.positions`,
      [
        now,
        address.toLowerCase(),
        dex,
        num(state.marginSummary?.accountValue),
        num(state.marginSummary?.totalMarginUsed),
        num(state.withdrawable),
        JSON.stringify(positions),
      ],
    );
  }

  await heartbeat("margin", `${posCount} positions @ ${address.slice(0, 8)}…`);
  console.log(JSON.stringify({ msg: "margin ok", posCount, dexs: dexs.length }));
}
