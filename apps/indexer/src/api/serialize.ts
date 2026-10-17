/**
 * Row → JSON. Every amount is exposed twice: the raw integer string
 * (lamports / base units) and a `_display` number (SOL / tokens, lossy).
 * Prices are objects with exact decimal strings plus a display number.
 */
import type { CandleRow, CoinRow, FloorSnapshotRow, HolderRow, QueueEventRow, TradeRow } from "../db/schema.js";
import {
  baseUnitsToTokens,
  gapBps,
  lamportsPerBaseUnit,
  lamportsPerToken,
  lamportsToSol,
  priceRatio,
  solPerToken,
  type Ratio,
} from "../domain/math.js";
import { brakeEta } from "../domain/queue.js";
import { effectiveParams, rowFloor, rowPrice } from "../domain/reducer.js";
import { toJsonSafe } from "../domain/json.js";

export interface PriceJson {
  sol_per_token: string;
  lamports_per_token: string;
  lamports_per_base_unit: string;
  display: number;
}

export function priceJson(r: Ratio | null): PriceJson | null {
  if (!r) return null;
  const s = solPerToken(r);
  return { sol_per_token: s, lamports_per_token: lamportsPerToken(r), lamports_per_base_unit: lamportsPerBaseUnit(r), display: Number(s) };
}

const sol = (v: bigint) => ({ raw: v.toString(), display: lamportsToSol(v) });
const tok = (v: bigint) => ({ raw: v.toString(), display: baseUnitsToTokens(v) });

/** `{ key: raw, key_display: number }` */
type Amounts<K extends string> = { [P in K]: string } & { [P in K as `${P}_display`]: number };

function amounts<K extends string>(entries: Record<K, [bigint, "sol" | "tok"]>): Amounts<K> {
  const out: Record<string, string | number> = {};
  for (const [k, [v, kind]] of Object.entries(entries) as [string, [bigint, "sol" | "tok"]][]) {
    const a = kind === "sol" ? sol(v) : tok(v);
    out[k] = a.raw;
    out[`${k}_display`] = a.display;
  }
  return out as Amounts<K>;
}

export interface SerializeCtx {
  now: Date;
  slotMs: number;
}

export function coinJson(row: CoinRow, ctx: SerializeCtx) {
  const price = rowPrice(row);
  const floor = rowFloor(row);
  const active = row.phase === "graduated";
  const params = effectiveParams(row);
  const gradSol = BigInt(params.graduation_sol);
  const refPrice = priceRatio(row.brake_ref_sol, row.brake_ref_tok);
  return {
    mint: row.mint,
    coin: row.coin,
    creator: row.creator,
    name: row.name,
    symbol: row.symbol,
    uri: row.uri,
    image_url: row.image_url,
    description: row.description,
    params: row.params,
    phase: row.phase,
    created_slot: row.created_slot,
    created_at: row.created_ts?.toISOString() ?? null,
    graduated_slot: row.graduated_slot,
    graduated_at: row.graduated_ts?.toISOString() ?? null,
    ...amounts({
      real_sol: [row.real_sol, "sol"],
      floor_reserve: [row.floor_reserve, "sol"],
      pool_sol: [row.pool_sol, "sol"],
      tokens_sold: [row.tokens_sold, "tok"],
      pool_tok: [row.pool_tok, "tok"],
      queued: [row.queued, "tok"],
      supply: [row.supply, "tok"],
      circulating: [row.circulating, "tok"],
      sol_reserves: [row.sol_reserves, "sol"],
      token_reserves: [row.token_reserves, "tok"],
      mcap_sol: [row.mcap_sol, "sol"],
      volume_sol: [row.volume_sol, "sol"],
      total_redeemed_sol: [row.total_redeemed_sol, "sol"],
    }),
    price: priceJson(price),
    /** Redeemable floor; null before graduation. */
    floor: active ? priceJson(floor) : null,
    floor_active: active,
    /** Before graduation: real_sol / tokens_sold (not redeemable yet). Null after. */
    floor_preview: active ? null : priceJson(floor),
    gap_bps: gapBps(price, floor),
    graduation_progress_bps: active ? 10_000 : gradSol > 0n ? Number((row.real_sol * 10_000n) / gradSol) : null,
    holders_count: row.holders_count,
    redeem_count: row.redeem_count,
    buy_count: row.buy_count,
    sell_count: row.sell_count,
    brake: {
      engaged: row.brake_engaged,
      epoch: row.brake_epoch,
      engagements: row.brake_engagements,
      drop_bps: params.brake_drop_bps,
      window_slots: Number(params.brake_window_slots),
      window_start: row.brake_window_start,
      ref_price: priceJson(refPrice),
      queued: row.queued.toString(),
      queued_display: baseUnitsToTokens(row.queued),
      window: brakeEta(row, ctx.now, ctx.slotMs),
    },
    last_trade_at: row.last_trade_ts?.toISOString() ?? null,
    last_event_slot: row.last_event_slot,
    updated_at: row.updated_at.toISOString(),
  };
}

const decimalDisplay = (s: string) => Number(s);

export function tradeJson(t: TradeRow) {
  return {
    signature: t.signature,
    event_index: t.event_index,
    user: t.user,
    side: t.side,
    phase: t.phase,
    is_queue_fill: t.is_queue_fill,
    ...amounts({
      sol_amount: [t.sol_amount, "sol"],
      token_amount: [t.token_amount, "tok"],
      fee_total: [t.fee_total, "sol"],
      fee_to_floor: [t.fee_to_floor, "sol"],
      queued_remainder: [t.queued_remainder, "tok"],
    }),
    price_after: t.price_after,
    price_after_display: decimalDisplay(t.price_after),
    floor_after: t.floor_after,
    floor_after_display: decimalDisplay(t.floor_after),
    slot: t.slot,
    ts: t.ts.toISOString(),
  };
}

export function candleJson(c: CandleRow) {
  return {
    bucket_ts: c.bucket_ts.toISOString(),
    time: Math.floor(c.bucket_ts.getTime() / 1000),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    floor_at_close: c.floor_at_close,
    volume_sol: c.volume_sol.toString(),
    trades: c.trades,
    display: {
      open: decimalDisplay(c.open),
      high: decimalDisplay(c.high),
      low: decimalDisplay(c.low),
      close: decimalDisplay(c.close),
      floor_at_close: decimalDisplay(c.floor_at_close),
      volume_sol: lamportsToSol(c.volume_sol),
    },
  };
}

export function snapshotJson(s: FloorSnapshotRow) {
  return {
    minute: s.minute.toISOString(),
    time: Math.floor(s.minute.getTime() / 1000),
    floor: s.floor,
    floor_display: decimalDisplay(s.floor),
    price: s.price,
    price_display: decimalDisplay(s.price),
    floor_active: s.floor_active,
    ...amounts({ pool_sol: [s.pool_sol, "sol"], pool_tok: [s.pool_tok, "tok"], circulating: [s.circulating, "tok"] }),
  };
}

/** Keep the last snapshot of every `intervalSeconds` bucket (input sorted ascending). */
export function downsampleSnapshots<T extends { minute: Date }>(rows: readonly T[], intervalSeconds: number): T[] {
  if (intervalSeconds <= 60) return [...rows];
  const ms = intervalSeconds * 1000;
  const out = new Map<number, T>();
  for (const r of rows) out.set(Math.floor(r.minute.getTime() / ms), r);
  return [...out.values()];
}

export function queueEventJson(e: QueueEventRow) {
  return {
    signature: e.signature,
    event_index: e.event_index,
    kind: e.kind,
    user: e.user,
    epoch: e.epoch,
    amount: e.amount?.toString() ?? null,
    amount_display: e.amount !== null ? baseUnitsToTokens(e.amount) : null,
    queued_total: e.queued_total?.toString() ?? null,
    sol_amount: e.sol_amount?.toString() ?? null,
    sol_amount_display: e.sol_amount !== null ? lamportsToSol(e.sol_amount) : null,
    settle_kind: e.settle_kind,
    window_start: e.window_start,
    data: e.data,
    slot: e.slot,
    ts: e.ts.toISOString(),
  };
}

export function holderJson(h: HolderRow, supply: bigint, circulating: bigint) {
  return {
    owner: h.owner,
    balance: h.balance.toString(),
    balance_display: baseUnitsToTokens(h.balance),
    share_of_supply_bps: supply > 0n ? Number((h.balance * 10_000n) / supply) : null,
    share_of_circulating_bps: circulating > 0n ? Number((h.balance * 10_000n) / circulating) : null,
    last_updated: h.last_updated.toISOString(),
  };
}

/** Value of `balance` base units at a lamports-per-base-unit ratio, in lamports. */
export function valueAt(balance: bigint, r: Ratio | null): bigint {
  return r ? (balance * r.num) / r.den : 0n;
}

export { toJsonSafe };
