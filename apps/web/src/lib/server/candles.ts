/** OHLCV candles and floor snapshots from the history ticks (same rules as the mock and the indexer). */
import type { CandleInterval, CandleJson, SnapshotJson } from "@/lib/api/types";
import type { Tick } from "./history";
import { solD, tokD } from "./serialize";

const INTERVAL_MS: Record<CandleInterval, number> = { "1m": 60_000, "5m": 300_000, "1h": 3_600_000 };
const MAX_BUCKETS = 600;

/** `ticks` oldest first. Buckets run from the first tick to `now`, carrying the last close and floor forward. */
export function candlesFrom(ticks: readonly Tick[], interval: CandleInterval, now = Date.now()): CandleJson[] {
  const step = INTERVAL_MS[interval];
  const first = ticks[0];
  if (!first) return [];
  const endBucket = Math.floor(now / step) * step;
  const startBucket = Math.floor(first.ms / step) * step;
  const from = Math.max(startBucket, endBucket - step * MAX_BUCKETS);
  let prevClose = first.price;
  let prevFloor = first.active ? first.floor : 0;
  let ti = 0;
  while (ti < ticks.length && ticks[ti]!.ms < from) {
    prevClose = ticks[ti]!.price || prevClose;
    prevFloor = ticks[ti]!.active ? ticks[ti]!.floor : prevFloor;
    ti++;
  }
  const out: CandleJson[] = [];
  for (let b = from; b <= endBucket; b += step) {
    const o = prevClose;
    let h = prevClose;
    let l = prevClose;
    let cl = prevClose;
    let vol = 0n;
    let n = 0;
    let fl = prevFloor;
    while (ti < ticks.length && ticks[ti]!.ms < b + step) {
      const t = ticks[ti]!;
      if (t.price > 0) {
        cl = t.price;
        h = Math.max(h, cl);
        l = Math.min(l, cl);
      }
      if (t.active) fl = t.floor;
      vol += t.volume;
      n++;
      ti++;
    }
    prevClose = cl;
    prevFloor = fl;
    out.push({
      bucket_ts: new Date(b).toISOString(),
      time: Math.floor(b / 1000),
      open: o.toPrecision(12),
      high: h.toPrecision(12),
      low: l.toPrecision(12),
      close: cl.toPrecision(12),
      floor_at_close: fl.toPrecision(12),
      volume_sol: vol.toString(),
      trades: n,
      display: { open: o, high: h, low: l, close: cl, floor_at_close: fl, volume_sol: solD(vol) },
    });
  }
  return out;
}

/** The last tick of every `seconds` bucket between `from` and `to`. */
export function snapshotsFrom(ticks: readonly Tick[], seconds: number, from: Date, to: Date): SnapshotJson[] {
  const step = seconds * 1000;
  const byBucket = new Map<number, Tick>();
  for (const t of ticks) {
    if (t.ms < from.getTime() || t.ms > to.getTime()) continue;
    byBucket.set(Math.floor(t.ms / step) * step, t);
  }
  return [...byBucket.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([b, t]) => ({
      minute: new Date(b).toISOString(),
      time: Math.floor(b / 1000),
      floor: t.floor.toPrecision(12),
      floor_display: t.floor,
      price: t.price.toPrecision(12),
      price_display: t.price,
      floor_active: t.active,
      pool_sol: t.poolSol.toString(),
      pool_sol_display: solD(t.poolSol),
      pool_tok: t.poolTok.toString(),
      pool_tok_display: tokD(t.poolTok),
      circulating: t.circ.toString(),
      circulating_display: tokD(t.circ),
    }));
}
