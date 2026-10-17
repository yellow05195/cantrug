import { describe, expect, it } from "vitest";
import type { CoinRow } from "../src/db/schema.js";
import {
  circulating,
  decimalToRatio,
  divToDecimal,
  floorRatio,
  gapBps,
  lamportsPerBaseUnit,
  lamportsPerToken,
  priceRatio,
  solPerToken,
  windowStart,
} from "../src/domain/math.js";
import { brakeEta } from "../src/domain/queue.js";
import { coinJson } from "../src/api/serialize.js";
import { emptyCoin, reduceCoin } from "../src/domain/reducer.js";
import { coinCreated, curveTrade, graduated, SUPPLY, T0 } from "./fixtures.js";

describe("decimal helpers", () => {
  it("divToDecimal floors and trims", () => {
    expect(divToDecimal(1n, 3n, 6)).toBe("0.333333");
    expect(divToDecimal(10n, 4n, 6)).toBe("2.5");
    expect(divToDecimal(10n, 5n, 6)).toBe("2");
    expect(divToDecimal(0n, 5n, 6)).toBe("0");
    expect(divToDecimal(-1n, 4n, 2)).toBe("-0.25");
  });
  it("decimalToRatio parses numeric strings", () => {
    expect(decimalToRatio("412.0476")).toEqual({ num: 4120476n, den: 10000n });
    expect(decimalToRatio("7")).toEqual({ num: 7n, den: 1n });
  });
  it("unit conversions are consistent", () => {
    const r = priceRatio(30_000_000_000n, 1_073_000_000_000_000n)!;
    expect(lamportsPerBaseUnit(r)).toBe("0.000027958993476234");
    expect(lamportsPerToken(r)).toBe("27.958993476234");
    expect(solPerToken(r)).toBe("0.000000027958993476");
  });
});

describe("gap_bps", () => {
  it("is (price − floor) / price in bps, floored", () => {
    const p = priceRatio(85_258_029_914n, 206_913_043_479_108n);
    const f = floorRatio(85_258_029_914n, SUPPLY, 206_913_043_479_108n, 0n);
    // floor/price = T / C = 206 913 043 479 108 / 793 086 956 520 892 = 0.26089…
    expect(gapBps(p, f)).toBe(7391);
  });
  it("is 0 when floor equals price and negative when the floor is above", () => {
    expect(gapBps({ num: 5n, den: 10n }, { num: 1n, den: 2n })).toBe(0);
    expect(gapBps({ num: 1n, den: 1n }, { num: 3n, den: 2n })).toBe(-5000);
    expect(gapBps({ num: 3n, den: 1n }, { num: 1n, den: 1n })).toBe(6666);
  });
  it("is null when undefined", () => {
    expect(gapBps(null, { num: 1n, den: 1n })).toBeNull();
    expect(gapBps({ num: 0n, den: 1n }, { num: 1n, den: 1n })).toBeNull();
    expect(floorRatio(1n, 10n, 5n, 5n)).toBeNull(); // nothing circulating
    expect(circulating(10n, 5n, 7n)).toBe(0n);
  });
  it("coinJson exposes gap_bps, floor_active and floor_preview", () => {
    const at = (s: bigint) => ({ ts: new Date(Number(s) * 1000) });
    const curve = reduceCoin(reduceCoin(null, coinCreated(), at(T0)), curveTrade(), at(T0 + 1n));
    const cj = coinJson(curve, { now: new Date(Number(T0 + 2n) * 1000), slotMs: 400 });
    expect(cj.floor_active).toBe(false);
    expect(cj.floor).toBeNull();
    expect(cj.floor_preview?.lamports_per_token).toBe(curve.floor_lamports_per_token);
    expect(cj.gap_bps).toBeGreaterThan(0);
    const grad = reduceCoin(curve, graduated(), at(T0 + 600n));
    const gj = coinJson(grad, { now: new Date(Number(T0 + 601n) * 1000), slotMs: 400 });
    expect(gj.floor_active).toBe(true);
    expect(gj.floor_preview).toBeNull();
    expect(gj.floor?.lamports_per_token).toBe("107.50149048978");
    expect(gj.gap_bps).toBe(7391);
    expect(gj.pool_sol).toBe("85258029914");
    expect(gj.pool_sol_display).toBeCloseTo(85.258029914, 9);
  });
});

describe("brake window", () => {
  it("windowStart tiles from the anchor (floored_core::window_start)", () => {
    expect(windowStart(1000n, 150n, 999n)).toBe(1000n);
    expect(windowStart(1000n, 150n, 1149n)).toBe(1000n);
    expect(windowStart(1000n, 150n, 1150n)).toBe(1150n);
    expect(windowStart(1000n, 150n, 1777n)).toBe(1750n);
    expect(windowStart(1000n, 0n, 5000n)).toBe(1000n);
  });
  it("estimates the next window from the last event slot and wall-clock drift", () => {
    const row: CoinRow = { ...emptyCoin("m", new Date(0)), brake_window_start: 1000, last_event_slot: 1100, last_event_ts: new Date(10_000) };
    // 4 s later at 400 ms/slot → slot 1110; window [1000, 1150) → 40 slots → 16 s.
    const eta = brakeEta(row, new Date(14_000), 400)!;
    expect(eta).toMatchObject({ est_current_slot: 1110, current_window_start: 1000, next_window_start: 1150, slots_remaining: 40, eta_seconds: 16 });
    expect(brakeEta({ ...row, last_event_slot: 0 }, new Date(), 400)).toBeNull();
  });
});
