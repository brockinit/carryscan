/** Positioning radar — crowding from funding windows, spikes, and basis. Pure, no I/O. */

export type CrowdRegime =
  | "long_crowded"
  | "short_crowded"
  | "acute_long"
  | "acute_short"
  | "balanced";

export type Positioning = {
  crowd_score: number;
  regime: CrowdRegime;
  regime_label: string;
  note: string;
  spike_pts: number;
  funding_z: number;
  basis_z: number;
  oi_rank: number;
};

export type PositioningInput = {
  coin: string;
  apr_now: number;
  apr_7d: number;
  apr_30d: number;
  basis_pct: number | null;
  oi_usd: number;
};

const REGIME_META: Record<
  CrowdRegime,
  { label: string; note: string }
> = {
  long_crowded: {
    label: "Long crowded",
    note: "Elevated trailing funding — levered longs paying shorts. Carry candidate; flush risk if demand fades.",
  },
  short_crowded: {
    label: "Short crowded",
    note: "Negative trailing funding — shorts paying longs. Reverse-carry / squeeze-pressure watch.",
  },
  acute_long: {
    label: "Acute long pressure",
    note: "Now ≫ 7d funding — burst of long demand on top of (or instead of) the regime. Treat as event, not coupon.",
  },
  acute_short: {
    label: "Acute short pressure",
    note: "Now ≪ 7d funding — burst of short demand / hedge flow. Sign can flip the paid side quickly.",
  },
  balanced: {
    label: "Balanced",
    note: "No strong cross-sectional crowding. Funding near the pack — low positioning signal.",
  },
};

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = mean(xs.map((x) => (x - m) ** 2));
  return Math.sqrt(v);
}

function zScores(xs: number[]): number[] {
  const m = mean(xs);
  const s = stdev(xs);
  if (s < 1e-9) return xs.map(() => 0);
  return xs.map((x) => (x - m) / s);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function rank01(values: number[]): number[] {
  const n = values.length;
  if (!n) return [];
  const order = values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => a.v - b.v);
  const out = Array(n).fill(0.5);
  order.forEach((o, rank) => {
    out[o.i] = n === 1 ? 0.5 : rank / (n - 1);
  });
  return out;
}

function classify(
  apr7d: number,
  spikePts: number,
  fundingZ: number,
): CrowdRegime {
  const acute =
    Math.abs(spikePts) >= 12 && Math.abs(spikePts) >= Math.max(8, Math.abs(apr7d) * 0.45);
  if (acute) return spikePts > 0 ? "acute_long" : "acute_short";
  // Require both cross-sectional extremity and a meaningful absolute level
  // so "least long in a rich pack" is not mislabeled short-crowded.
  if (apr7d >= 12 || (fundingZ >= 0.85 && apr7d >= 8)) return "long_crowded";
  if (apr7d <= -8 || (fundingZ <= -0.85 && apr7d <= -2)) return "short_crowded";
  return "balanced";
}

/** Attach cross-sectional positioning fields to each market row. */
export function attachPositioning<T extends PositioningInput>(
  markets: T[],
): Array<T & { positioning: Positioning }> {
  const apr7 = markets.map((m) => m.apr_7d);
  const basis = markets.map((m) => m.basis_pct ?? 0);
  const oi = markets.map((m) => m.oi_usd);
  const fz = zScores(apr7);
  const bz = zScores(basis);
  const oiR = rank01(oi);

  return markets.map((m, i) => {
    const spikePts = m.apr_now - m.apr_7d;
    const fundingZ = fz[i] ?? 0;
    const basisZ = bz[i] ?? 0;
    const oiRank = oiR[i] ?? 0.5;

    const crowd = clamp(
      0.55 * clamp(fundingZ * 28, -55, 55) +
        0.35 * clamp(spikePts * 1.15, -40, 40) +
        0.1 * clamp(basisZ * 12, -15, 15),
      -100,
      100,
    );

    const regime = classify(m.apr_7d, spikePts, fundingZ);
    const meta = REGIME_META[regime];

    return {
      ...m,
      positioning: {
        crowd_score: Math.round(crowd * 10) / 10,
        regime,
        regime_label: meta.label,
        note: meta.note,
        spike_pts: Math.round(spikePts * 10) / 10,
        funding_z: Math.round(fundingZ * 100) / 100,
        basis_z: Math.round(basisZ * 100) / 100,
        oi_rank: Math.round(oiRank * 100) / 100,
      },
    };
  });
}

export function positioningSummary(
  rows: Array<{ coin: string; positioning: Positioning; oi_usd: number }>,
) {
  if (!rows.length) {
    return {
      most_long: null as null | { coin: string; crowd_score: number },
      most_short: null as null | { coin: string; crowd_score: number },
      acute_count: 0,
      median_abs_score: 0,
    };
  }
  const byScore = [...rows].sort(
    (a, b) => b.positioning.crowd_score - a.positioning.crowd_score,
  );
  const acute = rows.filter((r) =>
    r.positioning.regime === "acute_long" ||
    r.positioning.regime === "acute_short",
  ).length;
  const abs = rows.map((r) => Math.abs(r.positioning.crowd_score)).sort((a, b) => a - b);
  const mid = Math.floor(abs.length / 2);
  const medianAbs =
    abs.length % 2 ? abs[mid] : (abs[mid - 1] + abs[mid]) / 2;

  return {
    most_long: {
      coin: byScore[0].coin,
      crowd_score: byScore[0].positioning.crowd_score,
    },
    most_short: {
      coin: byScore[byScore.length - 1].coin,
      crowd_score: byScore[byScore.length - 1].positioning.crowd_score,
    },
    acute_count: acute,
    median_abs_score: Math.round(medianAbs * 10) / 10,
  };
}
