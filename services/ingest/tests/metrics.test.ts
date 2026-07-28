import { describe, it, expect } from "vitest";
import {
  apr,
  basis,
  etBucket,
  etWallTimeToUtc,
  feeDrag,
  heatmapCells,
  netCarry,
  weekendGap,
} from "../src/metrics/index.js";

describe("metrics golden values", () => {
  it("apr constant hourly", () => {
    const rates = Array(168).fill(0.0000342);
    expect(apr(rates)).toBeCloseTo(29.96, 1);
  });

  it("fee drag", () => {
    expect(feeDrag(10, 30)).toBeCloseTo(1.2167, 3);
  });

  it("net carry", () => {
    expect(netCarry(27.6, 5.5, 10, 30)).toBeCloseTo(20.88, 1);
  });

  it("basis", () => {
    expect(basis(342.18, 341.12)).toBeCloseTo(0.3107, 3);
  });

  it("heatmap timezone friday not saturday", () => {
    // 2026-07-25T03:00Z = Fri 23:00 ET (EDT)
    const ts = new Date("2026-07-25T03:00:00Z");
    const [dow, hour] = etBucket(ts);
    expect(dow).toBe(4);
    expect(hour).toBe(23);
    const matrix = heatmapCells([[ts, 0.0001]]);
    expect(matrix[4][23]).toBeCloseTo(apr([0.0001]), 1);
    expect(matrix[5][23]).toBe(0);
  });

  it("weekend gap synthetic + DST weekend", () => {
    const fri = etWallTimeToUtc("2026-07-24", 16, 0);
    const candles: Array<[Date, number, number, number, number]> = [
      [fri, 100, 101, 99, 100],
      [etWallTimeToUtc("2026-07-24", 17, 0), 100, 101.5, 99.5, 100.5],
      [etWallTimeToUtc("2026-07-25", 12, 0), 100.5, 102, 100, 101],
      [etWallTimeToUtc("2026-07-27", 9, 0), 99, 100, 98, 99.5],
      [etWallTimeToUtc("2026-07-27", 9, 30), 99.58, 100, 99, 99.8],
    ];
    const funding: Array<[Date, number]> = [
      [etWallTimeToUtc("2026-07-24", 17, 0), 0.0001],
      [etWallTimeToUtc("2026-07-25", 12, 0), 0.0002],
      [etWallTimeToUtc("2026-07-26", 12, 0), 0.0003],
    ];
    const gap = weekendGap(candles, funding, 100, 99.62, "2026-07-24");
    expect(gap).not.toBeNull();
    expect(gap!.perp_drift).toBeCloseTo(-0.42, 1);
    expect(gap!.cash_gap).toBeCloseTo(-0.38, 1);
    expect(gap!.short_mae).toBeCloseTo(2.0, 1);
    expect(gap!.funding_banked).toBeCloseTo(0.06, 2);

    // DST-crossing weekend Fri Oct 30 2026 (DST ends Sun Nov 1)
    const fri2 = "2026-10-30";
    const candles2: Array<[Date, number, number, number, number]> = [
      [etWallTimeToUtc(fri2, 16, 0), 200, 201, 199, 200],
      [etWallTimeToUtc("2026-10-31", 12, 0), 200, 205, 198, 203],
      [etWallTimeToUtc("2026-11-01", 12, 0), 203, 204, 201, 202],
      [etWallTimeToUtc("2026-11-02", 9, 30), 201, 202, 200, 201.5],
    ];
    const gap2 = weekendGap(candles2, [], 200, 201, fri2);
    expect(gap2).not.toBeNull();
    expect(gap2!.perp_drift).toBeCloseTo(0.5, 1);
    expect(gap2!.short_mae).toBeCloseTo(2.5, 1);
  });
});
