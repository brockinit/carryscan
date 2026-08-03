import { HLClient } from "../hl.js";
import { getPool, heartbeat } from "../db.js";

type DexInfo = {
  name?: string;
  fullName?: string;
  deployer?: string;
} | null;

/** Discover HIP-3 perp dexs and upsert unknown coins into markets. */
export async function run(hl?: HLClient) {
  const client = hl ?? new HLClient();
  const raw = (await client.perpDexs()) as DexInfo[];
  const pool = getPool();

  // perpDexs: index 0 is often null (main dex); named HIP-3 dexs follow
  const dexs: Array<{ name: string; deployer: string | null }> = [];
  for (const d of raw || []) {
    if (!d || !d.name) continue;
    dexs.push({ name: d.name, deployer: d.deployer ?? null });
  }
  // Always include xyz even if listing shape varies
  if (!dexs.some((d) => d.name === "xyz")) {
    dexs.unshift({ name: "xyz", deployer: null });
  }

  for (const d of dexs) {
    await pool.query(
      `INSERT INTO hip3_dexs (name, deployer, active, last_seen)
       VALUES ($1,$2,true,now())
       ON CONFLICT (name) DO UPDATE SET
         deployer = COALESCE(EXCLUDED.deployer, hip3_dexs.deployer),
         active = true,
         last_seen = now()`,
      [d.name, d.deployer],
    );
  }

  let upserted = 0;
  for (const d of dexs) {
    const [meta] = await client.metaAndAssetCtxs(d.name);
    const universe = meta?.universe || [];
    for (const u of universe) {
      const coin = u.name;
      if (!coin) continue;
      const ticker = coin.includes(":") ? coin.split(":")[1] : coin;
      const knownCash = KNOWN_CASH[ticker];
      const { rowCount } = await pool.query(
        `INSERT INTO markets (dex, coin, cash_ticker, ref_type, name, active)
         VALUES ($1,$2,$3,$4,$5,true)
         ON CONFLICT (coin) DO UPDATE SET
           dex = EXCLUDED.dex,
           active = true,
           name = CASE
             WHEN markets.name LIKE 'Unknown%' THEN EXCLUDED.name
             ELSE markets.name
           END,
           cash_ticker = COALESCE(markets.cash_ticker, EXCLUDED.cash_ticker),
           ref_type = CASE
             WHEN markets.ref_type = 'none' AND EXCLUDED.ref_type <> 'none'
               THEN EXCLUDED.ref_type
             ELSE markets.ref_type
           END`,
        [
          d.name,
          coin,
          knownCash?.ticker ?? null,
          knownCash?.ref_type ?? "none",
          knownCash?.name ?? `Unknown ${ticker}`,
        ],
      );
      if (rowCount) upserted += rowCount;
    }
  }

  await heartbeat("discover", `${dexs.length} dexs, ~${upserted} market upserts`);
  console.log(
    JSON.stringify({
      msg: "discover ok",
      dexs: dexs.map((d) => d.name),
      upserted,
    }),
  );
}

const KNOWN_CASH: Record<
  string,
  { ticker: string; ref_type: "stock" | "etf_proxy"; name: string }
> = {
  SPCX: { ticker: "SPCX", ref_type: "stock", name: "SpaceX Corp" },
  TSLA: { ticker: "TSLA", ref_type: "stock", name: "Tesla Inc" },
  NVDA: { ticker: "NVDA", ref_type: "stock", name: "NVIDIA Corp" },
  MSTR: { ticker: "MSTR", ref_type: "stock", name: "Strategy Inc" },
  HOOD: { ticker: "HOOD", ref_type: "stock", name: "Robinhood Markets" },
  COIN: { ticker: "COIN", ref_type: "stock", name: "Coinbase Global" },
  PLTR: { ticker: "PLTR", ref_type: "stock", name: "Palantir Technologies" },
  AMD: { ticker: "AMD", ref_type: "stock", name: "Advanced Micro Devices" },
  AAPL: { ticker: "AAPL", ref_type: "stock", name: "Apple Inc" },
  MSFT: { ticker: "MSFT", ref_type: "stock", name: "Microsoft Corp" },
  META: { ticker: "META", ref_type: "stock", name: "Meta Platforms" },
  AMZN: { ticker: "AMZN", ref_type: "stock", name: "Amazon.com" },
  GOOGL: { ticker: "GOOGL", ref_type: "stock", name: "Alphabet Inc" },
  XYZ100: { ticker: "QQQ", ref_type: "etf_proxy", name: "Top-100 index" },
};
