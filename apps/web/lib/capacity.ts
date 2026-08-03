/** OI-based capacity score and suggested clip sizes. */

export type Capacity = {
  score: number; // 0–100
  label: "thin" | "ok" | "deep";
  /** Rough max clip (USD notional) before impacting a thin book */
  clip_usd: number;
};

/** Log-scaled capacity from open interest. */
export function capacityFromOi(oiUsd: number): Capacity {
  if (!Number.isFinite(oiUsd) || oiUsd <= 0) {
    return { score: 0, label: "thin", clip_usd: 0 };
  }
  // $5M → ~35, $50M → ~70, $200M → ~90
  const score = Math.max(
    0,
    Math.min(100, (Math.log10(oiUsd) - 5.5) * 40),
  );
  const label: Capacity["label"] =
    score < 40 ? "thin" : score < 70 ? "ok" : "deep";
  // Suggest ~2% of OI as a cautious clip, floored/capped
  const clip = Math.max(25_000, Math.min(10_000_000, oiUsd * 0.02));
  return {
    score: Math.round(score),
    label,
    clip_usd: Math.round(clip / 1000) * 1000,
  };
}
