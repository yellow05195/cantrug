/**
 * Incremental OHLCV candles. Prices are SOL per token decimal strings; the
 * comparison is done exactly on rationals (no float rounding).
 */
import type { CandleInterval, CandleRow } from "../db/schema.js";
import { decimalToRatio } from "./math.js";

export const CANDLE_INTERVALS: readonly CandleInterval[] = ["1m", "5m", "1h"];

export const INTERVAL_SECONDS: Record<CandleInterval, number> = {
  "1m": 60,
  "5m": 300,
  "1h": 3600,
};

/** Start of the bucket that contains `ts` (UTC-aligned). */
export function bucketStart(ts: Date, interval: CandleInterval): Date {
  const ms = INTERVAL_SECONDS[interval] * 1000;
  return new Date(Math.floor(ts.getTime() / ms) * ms);
}

export interface CandleTick {
  mint: string;
  ts: Date;
  slot: number;
  /** SOL per token after the trade. */
  price: string;
  /** SOL per token floor after the trade. */
  floor: string;
  /** Lamports traded. */
  volume: bigint;
}

/** Compare two non-negative decimal strings exactly. */
export function cmpDecimal(a: string, b: string): number {
  const x = decimalToRatio(a);
  const y = decimalToRatio(b);
  const l = x.num * y.den;
  const r = y.num * x.den;
  return l < r ? -1 : l > r ? 1 : 0;
}

/**
 * Merge one trade into the candle of its bucket. Out-of-order ticks are
 * handled: the open belongs to the earliest slot, the close (and
 * floor_at_close) to the latest; on equal slots the later-processed tick
 * becomes the close and the open is kept.
 */
export function applyTick(prev: CandleRow | null, tick: CandleTick, interval: CandleInterval): CandleRow {
  const bucket = bucketStart(tick.ts, interval);
  if (!prev) {
    return {
      mint: tick.mint,
      interval,
      bucket_ts: bucket,
      open: tick.price,
      high: tick.price,
      low: tick.price,
      close: tick.price,
      volume_sol: tick.volume,
      trades: 1,
      floor_at_close: tick.floor,
      open_slot: tick.slot,
      close_slot: tick.slot,
    };
  }
  if (prev.bucket_ts.getTime() !== bucket.getTime() || prev.interval !== interval || prev.mint !== tick.mint) {
    throw new Error("applyTick: tick does not belong to this candle");
  }
  const next: CandleRow = { ...prev, volume_sol: prev.volume_sol + tick.volume, trades: prev.trades + 1 };
  if (cmpDecimal(tick.price, prev.high) > 0) next.high = tick.price;
  if (cmpDecimal(tick.price, prev.low) < 0) next.low = tick.price;
  if (tick.slot < prev.open_slot) {
    next.open = tick.price;
    next.open_slot = tick.slot;
  }
  if (tick.slot >= prev.close_slot) {
    next.close = tick.price;
    next.close_slot = tick.slot;
    next.floor_at_close = tick.floor;
  }
  return next;
}
