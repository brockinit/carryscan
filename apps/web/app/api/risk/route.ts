import { NextResponse } from "next/server";
import { getPool, hasDatabase } from "@/lib/db";
import {
  fetchClearinghouseState,
  fetchHip3DexNames,
  fetchDexCtxs,
} from "@/lib/hl";
import type { RiskResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function distancePct(
  szi: number,
  mark: number | null,
  liq: number | null,
): number | null {
  if (mark == null || liq == null || mark === 0) return null;
  // Short: liq above mark; long: liq below mark
  if (szi < 0) return ((liq - mark) / mark) * 100;
  return ((mark - liq) / mark) * 100;
}

export async function GET() {
  const address = process.env.HL_WATCH_ADDRESS?.trim() || null;
  if (!address) {
    const empty: RiskResponse = {
      configured: false,
      address: null,
      as_of: null,
      account_value: null,
      total_margin_used: null,
      withdrawable: null,
      positions: [],
    };
    return NextResponse.json(empty);
  }

  try {
    if (hasDatabase()) {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT ts, dex, account_value, total_margin_used, withdrawable, positions
         FROM margin_snapshots
         WHERE address = $1
         ORDER BY ts DESC
         LIMIT 20`,
        [address.toLowerCase()],
      );
      if (rows.length) {
        const latestTs = rows[0].ts;
        const batch = rows.filter(
          (r) => new Date(r.ts).getTime() === new Date(latestTs).getTime(),
        );
        const positions: RiskResponse["positions"] = [];
        let account_value: number | null = null;
        let total_margin_used: number | null = null;
        let withdrawable: number | null = null;
        for (const r of batch) {
          account_value = num(r.account_value) ?? account_value;
          total_margin_used = num(r.total_margin_used) ?? total_margin_used;
          withdrawable = num(r.withdrawable) ?? withdrawable;
          const pos = Array.isArray(r.positions) ? r.positions : [];
          for (const p of pos) {
            const szi = Number(p.szi);
            const liq = p.liquidation_px == null ? null : Number(p.liquidation_px);
            positions.push({
              coin: String(p.coin),
              dex: String(r.dex),
              szi,
              liquidation_px: liq,
              mark: null,
              distance_pct: null,
              margin_used:
                p.margin_used == null ? null : Number(p.margin_used),
              leverage: p.leverage == null ? null : Number(p.leverage),
            });
          }
        }
        // Attach marks
        const dexs = Array.from(new Set(positions.map((p) => p.dex)));
        for (const dex of dexs) {
          try {
            const { byCoin } = await fetchDexCtxs(dex);
            for (const p of positions) {
              if (p.dex !== dex) continue;
              const mark = num(byCoin.get(p.coin)?.markPx);
              p.mark = mark;
              p.distance_pct = distancePct(p.szi, mark, p.liquidation_px);
            }
          } catch {
            /* skip */
          }
        }
        return NextResponse.json({
          configured: true,
          address,
          as_of: new Date(latestTs).toISOString(),
          account_value,
          total_margin_used,
          withdrawable,
          positions,
        } satisfies RiskResponse);
      }
    }

    // Live fallback
    const dexs = await fetchHip3DexNames();
    const positions: RiskResponse["positions"] = [];
    let account_value: number | null = null;
    let total_margin_used: number | null = null;
    let withdrawable: number | null = null;

    for (const dex of dexs) {
      const state = (await fetchClearinghouseState(address, dex)) as {
        marginSummary?: { accountValue?: string; totalMarginUsed?: string };
        withdrawable?: string;
        assetPositions?: Array<{
          position?: {
            coin?: string;
            szi?: string;
            liquidationPx?: string | null;
            marginUsed?: string;
            leverage?: { value?: number };
          };
        }>;
      };
      account_value = num(state.marginSummary?.accountValue) ?? account_value;
      total_margin_used =
        num(state.marginSummary?.totalMarginUsed) ?? total_margin_used;
      withdrawable = num(state.withdrawable) ?? withdrawable;
      const { byCoin } = await fetchDexCtxs(dex);
      for (const ap of state.assetPositions || []) {
        const p = ap.position;
        if (!p?.coin) continue;
        const szi = num(p.szi) ?? 0;
        if (!szi) continue;
        const liq = p.liquidationPx == null ? null : num(p.liquidationPx);
        const mark = num(byCoin.get(p.coin)?.markPx);
        positions.push({
          coin: p.coin,
          dex,
          szi,
          liquidation_px: liq,
          mark,
          distance_pct: distancePct(szi, mark, liq),
          margin_used: num(p.marginUsed),
          leverage: p.leverage?.value ?? null,
        });
      }
    }

    return NextResponse.json({
      configured: true,
      address,
      as_of: new Date().toISOString(),
      account_value,
      total_margin_used,
      withdrawable,
      positions,
    } satisfies RiskResponse);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "risk feed unreachable", detail: String(err) },
      { status: 503 },
    );
  }
}
