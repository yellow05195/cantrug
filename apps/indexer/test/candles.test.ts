import { describe, expect, it } from "vitest";
import { applyTick, bucketStart, cmpDecimal, type CandleTick } from "../src/domain/candles.js";
import { downsampleSnapshots } from "../src/api/serialize.js";

const t = (iso: string) => new Date(iso);
const tick = (over: Partial<CandleTick>): CandleTick => ({
  mint: "M",
  ts: t("2026-10-17T12:00:10Z"),
  slot: 100,
  price: "0.00000003",
  floor: "0.00000001",
  volume: 1_000n,
  ...over,
});

describe("candle bucketing", () => {
  it("aligns buckets on UTC boundaries", () => {
    expect(bucketStart(t("2026-10-17T12:34:56.789Z"), "1m").toISOString()).toBe("2026-10-17T12:34:00.000Z");
    expect(bucketStart(t("2026-10-17T12:34:56Z"), "5m").toISOString()).toBe("2026-10-17T12:30:00.000Z");
    expect(bucketStart(t("2026-10-17T12:34:56Z"), "1h").toISOString()).toBe("2026-10-17T12:00:00.000Z");
    expect(bucketStart(t("2026-10-17T12:35:00Z"), "5m").toISOString()).toBe("2026-10-17T12:35:00.000Z");
  });

  it("opens, extends and closes a candle", () => {
    let c = applyTick(null, tick({}), "1m");
    expect(c).toMatchObject({ open: "0.00000003", high: "0.00000003", low: "0.00000003", close: "0.00000003", trades: 1, volume_sol: 1_000n });
    expect(c.bucket_ts.toISOString()).toBe("2026-10-17T12:00:00.000Z");
    c = applyTick(c, tick({ slot: 101, price: "0.00000005", floor: "0.000000011", ts: t("2026-10-17T12:00:20Z") }), "1m");
    c = applyTick(c, tick({ slot: 102, price: "0.000000025", floor: "0.000000012", ts: t("2026-10-17T12:00:40Z"), volume: 500n }), "1m");
    expect(c).toMatchObject({ open: "0.00000003", high: "0.00000005", low: "0.000000025", close: "0.000000025", floor_at_close: "0.000000012", trades: 3, volume_sol: 2_500n });
  });

  it("handles out-of-order ticks: earliest slot opens, latest slot closes", () => {
    let c = applyTick(null, tick({ slot: 105, price: "2" }), "5m");
    c = applyTick(c, tick({ slot: 103, price: "1", floor: "0.1" }), "5m");
    expect(c.open).toBe("1");
    expect(c.close).toBe("2");
    c = applyTick(c, tick({ slot: 107, price: "3", floor: "0.3" }), "5m");
    expect(c).toMatchObject({ open: "1", close: "3", high: "3", low: "1", floor_at_close: "0.3", open_slot: 103, close_slot: 107 });
  });

  it("refuses a tick from another bucket", () => {
    const c = applyTick(null, tick({}), "1m");
    expect(() => applyTick(c, tick({ ts: t("2026-10-17T12:01:00Z") }), "1m")).toThrow();
  });

  it("compares decimals exactly", () => {
    expect(cmpDecimal("0.000000027958993476", "0.000000027958993477")).toBe(-1);
    expect(cmpDecimal("10", "9.999999999999999999")).toBe(1);
    expect(cmpDecimal("1.50", "1.5")).toBe(0);
  });

  it("downsamples floor snapshots keeping the last of each bucket", () => {
    const rows = ["12:00", "12:01", "12:04", "12:05", "12:09"].map((m) => ({ minute: t(`2026-10-17T${m}:00Z`) }));
    expect(downsampleSnapshots(rows, 300).map((r) => r.minute.toISOString().slice(11, 16))).toEqual(["12:04", "12:09"]);
    expect(downsampleSnapshots(rows, 60)).toHaveLength(5);
  });
});
