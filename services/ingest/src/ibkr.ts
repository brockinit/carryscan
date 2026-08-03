/** IBKR Flex Web Service — Borrow Fee Details. */

const SEND =
  "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest";
const GET =
  "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement";

export type BorrowRow = {
  ticker: string;
  as_of: string; // YYYY-MM-DD
  fee_rate_pct: number;
  raw: Record<string, string>;
};

export class IbkrFlexClient {
  constructor(
    private token = process.env.IBKR_FLEX_TOKEN || "",
    private queryId = process.env.IBKR_FLEX_QUERY_ID || "",
  ) {}

  get enabled() {
    return Boolean(this.token && this.queryId);
  }

  async fetchBorrowFees(): Promise<BorrowRow[]> {
    if (!this.enabled) {
      console.warn(JSON.stringify({ msg: "IBKR Flex unset" }));
      return [];
    }
    const sendUrl = `${SEND}?t=${encodeURIComponent(this.token)}&q=${encodeURIComponent(this.queryId)}&v=3`;
    const sendRes = await fetch(sendUrl, {
      headers: { "User-Agent": "CarryScan/1.0" },
    });
    const sendText = await sendRes.text();
    const ref = extractXml(sendText, "ReferenceCode");
    const status = extractXml(sendText, "Status");
    if (status !== "Success" || !ref) {
      throw new Error(`IBKR SendRequest failed: ${sendText.slice(0, 400)}`);
    }

    let statement = "";
    for (let i = 0; i < 12; i++) {
      await sleep(2000 + i * 500);
      const getUrl = `${GET}?t=${encodeURIComponent(this.token)}&q=${encodeURIComponent(ref)}&v=3`;
      const getRes = await fetch(getUrl, {
        headers: { "User-Agent": "CarryScan/1.0" },
      });
      statement = await getRes.text();
      if (!statement.includes("<ErrorCode>") && statement.includes("<FlexQueryResponse")) {
        break;
      }
      if (statement.includes("Statement generation in progress")) continue;
      if (statement.includes("<ErrorCode>")) {
        const code = extractXml(statement, "ErrorCode");
        if (code === "1019" || code === "1018") continue; // still generating
        throw new Error(`IBKR GetStatement error: ${statement.slice(0, 400)}`);
      }
    }

    return parseBorrowFees(statement);
  }
}

function extractXml(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1].trim() : null;
}

function parseBorrowFees(xml: string): BorrowRow[] {
  const out: BorrowRow[] = [];
  // Match BorrowFeeDetail or similar Flex rows
  const rowRe =
    /<(?:BorrowFeeDetail|HardToBorrowDetail|NonDirectHardToBorrowDetail)([^>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(xml))) {
    const attrs = m[1];
    const get = (k: string) => {
      const a = attrs.match(new RegExp(`${k}="([^"]*)"`, "i"));
      return a ? a[1] : "";
    };
    const symbol = get("symbol") || get("ticker");
    const rateStr =
      get("borrowFeeRate") || get("feeRate") || get("feeRate%") || get("marketFeeRate%");
    const dateStr = get("valueDate") || get("date") || get("reportDate");
    if (!symbol || !rateStr) continue;
    const fee = Number(rateStr);
    if (!Number.isFinite(fee)) continue;
    const asOf = normalizeDate(dateStr) || new Date().toISOString().slice(0, 10);
    out.push({
      ticker: symbol.toUpperCase(),
      as_of: asOf,
      // Flex borrowFeeRate is typically an annualized percent (e.g. 12.5)
      fee_rate_pct: fee,
      raw: { symbol, rateStr, dateStr },
    });
  }

  // Also scan nested text-style elements
  if (!out.length) {
    const blocks = xml.split(/<(?:BorrowFeeDetail|HardToBorrowDetail)/i).slice(1);
    for (const b of blocks) {
      const symbol =
        extractXml(`<x>${b}`, "symbol") ||
        b.match(/symbol="([^"]+)"/i)?.[1] ||
        "";
      const rateStr =
        extractXml(`<x>${b}`, "borrowFeeRate") ||
        b.match(/borrowFeeRate="([^"]+)"/i)?.[1] ||
        "";
      const dateStr =
        extractXml(`<x>${b}`, "valueDate") ||
        b.match(/valueDate="([^"]+)"/i)?.[1] ||
        "";
      if (!symbol || !rateStr) continue;
      const fee = Number(rateStr);
      if (!Number.isFinite(fee)) continue;
      out.push({
        ticker: symbol.toUpperCase(),
        as_of: normalizeDate(dateStr) || new Date().toISOString().slice(0, 10),
        fee_rate_pct: fee,
        raw: { symbol, rateStr, dateStr },
      });
    }
  }

  return out;
}

function normalizeDate(s: string): string | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
