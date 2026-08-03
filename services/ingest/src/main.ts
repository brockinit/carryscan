import cron from "node-cron";
import { HLClient } from "./hl.js";
import * as snapshot from "./jobs/snapshot.js";
import * as funding from "./jobs/funding.js";
import * as candles from "./jobs/candles.js";
import * as closes from "./jobs/closes.js";
import * as earnings from "./jobs/earnings.js";
import * as nightly from "./jobs/nightly.js";
import * as discover from "./jobs/discover.js";
import * as borrow from "./jobs/borrow.js";
import * as margin from "./jobs/margin.js";
import { getPool } from "./db.js";

const ET = "America/New_York";

async function withHl(fn: (hl: HLClient) => Promise<void>) {
  const hl = new HLClient();
  try {
    await fn(hl);
  } catch (e) {
    console.error(JSON.stringify({ msg: "job failed", err: String(e) }));
  }
}

async function backfill() {
  console.log(JSON.stringify({ msg: "backfill starting" }));
  const hl = new HLClient();
  try {
    await discover.run(hl);
    await funding.run(hl, true);
    await candles.run(hl, true, 120);
    await closes.run(180);
    await earnings.run();
    await borrow.run();
    await snapshot.run(hl);
    await margin.run(hl);
    await nightly.run();
  } finally {
    await getPool().end();
  }
  console.log(JSON.stringify({ msg: "backfill complete" }));
}

function schedule() {
  cron.schedule("* * * * *", () => withHl((hl) => snapshot.run(hl)), {
    timezone: ET,
  });
  cron.schedule("2 * * * *", () => withHl((hl) => funding.run(hl)), {
    timezone: ET,
  });
  cron.schedule("5 * * * *", () => withHl((hl) => candles.run(hl)), {
    timezone: ET,
  });
  cron.schedule("*/5 * * * *", () => withHl((hl) => margin.run(hl)), {
    timezone: ET,
  });
  cron.schedule("20 16 * * 1-5", () => closes.run().catch(console.error), {
    timezone: ET,
  });
  cron.schedule("30 8 * * 1-5", () => borrow.run().catch(console.error), {
    timezone: ET,
  });
  cron.schedule("0 18 * * 0", () => earnings.run().catch(console.error), {
    timezone: ET,
  });
  cron.schedule("15 0 * * *", () => withHl((hl) => discover.run(hl)), {
    timezone: ET,
  });
  cron.schedule("30 0 * * *", () => nightly.run().catch(console.error), {
    timezone: ET,
  });

  console.log(JSON.stringify({ msg: "startup discover+snapshot" }));
  withHl(async (hl) => {
    await discover.run(hl);
    await snapshot.run(hl);
    await margin.run(hl);
  }).then(() => console.log(JSON.stringify({ msg: "scheduler running" })));
}

async function once(job: string) {
  const map: Record<string, () => Promise<void>> = {
    snapshot: () => snapshot.run(),
    funding: () => funding.run(),
    candles: () => candles.run(),
    closes: () => closes.run(),
    earnings: () => earnings.run(),
    nightly: () => nightly.run(),
    discover: () => discover.run(),
    borrow: () => borrow.run(),
    margin: () => margin.run(),
  };
  const fn = map[job];
  if (!fn) throw new Error(`unknown job ${job}`);
  await fn();
  await getPool().end();
}

const args = process.argv.slice(2);
if (args.includes("--backfill")) {
  backfill().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else if (args.includes("--once")) {
  const idx = args.indexOf("--once");
  once(args[idx + 1]).catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  schedule();
}
