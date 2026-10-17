/**
 * Coin projection: `reduceCoin(prev, event, ctx) → next`.
 *
 * Every Trade / Graduated / Redeemed event carries the post-state of the coin
 * (reserves, tokens_sold, pool, queue, supply), and every queue event carries
 * the queue size after it (QueueJoined.queued_total, QueueProcessed.queued_after,
 * QueueSettled.queued_after, BrakeReleased ⇒ 0), so the state part of the row is
 * a pure projection of the latest event by slot. Nothing is derived from deltas.
 * Rules:
 *
 *  - State fields (reserves, pool, queue, phase, brake window, derived
 *    floor/price/mcap) are only overwritten when `event.slot >= last_event_slot`:
 *    a late, older event never moves the row backwards.
 *  - Additive statistics (buy/sell counts, volume, redeemed SOL, engagements)
 *    are applied for every event regardless of order. Idempotency is the
 *    caller's job (processed_signatures), which makes them order-independent.
 *  - Immutable facts (CoinCreated metadata, graduation slot) are always written.
 */
import type { CoinParams, FlooredEvent } from "../chain/types.js";
import type { CoinParamsJson, CoinRow } from "../db/schema.js";
import {
  circulating,
  floorPreviewRatio,
  floorRatio,
  lamportsPerToken,
  mcapLamports,
  priceRatio,
  TOTAL_SUPPLY,
  type Ratio,
} from "./math.js";

export interface ReduceContext {
  /** Event time: the event's own timestamp, or the transaction blockTime. */
  ts: Date;
}

/** floored_core::Params::DEFAULT, used when an event arrives before its CoinCreated. */
export const DEFAULT_PARAMS: CoinParamsJson = {
  virtual_sol: (30n * 10n ** 9n).toString(),
  virtual_tok: (1_073_000_000n * 10n ** 6n).toString(),
  curve_supply: (793_100_000n * 10n ** 6n).toString(),
  graduation_sol: (85n * 10n ** 9n).toString(),
  curve_fee_bps: 100,
  curve_fee_creator_share_bps: 4_000,
  curve_fee_protocol_share_bps: 3_000,
  pool_fee_bps: 50,
  pool_fee_pool_share_bps: 4_000,
  pool_fee_creator_share_bps: 4_000,
  redeem_fee_bps: 50,
  brake_drop_bps: 2_000,
  brake_window_slots: "150",
};

export function paramsToJson(p: CoinParams): CoinParamsJson {
  return {
    ...p,
    virtual_sol: p.virtual_sol.toString(),
    virtual_tok: p.virtual_tok.toString(),
    curve_supply: p.curve_supply.toString(),
    graduation_sol: p.graduation_sol.toString(),
    brake_window_slots: p.brake_window_slots.toString(),
  };
}

export function effectiveParams(row: Pick<CoinRow, "params">): CoinParamsJson {
  return row.params ?? DEFAULT_PARAMS;
}

/** A fresh row for a mint we have not seen yet. */
export function emptyCoin(mint: string, ts: Date): CoinRow {
  return {
    mint,
    coin: "",
    creator: "",
    name: "",
    symbol: "",
    uri: "",
    image_url: null,
    description: null,
    params: null,
    phase: "curve",
    created_slot: null,
    created_ts: null,
    graduated_slot: null,
    graduated_ts: null,
    real_sol: 0n,
    tokens_sold: 0n,
    floor_reserve: 0n,
    pool_sol: 0n,
    pool_tok: 0n,
    queued: 0n,
    supply: TOTAL_SUPPLY,
    sol_reserves: BigInt(DEFAULT_PARAMS.virtual_sol),
    token_reserves: BigInt(DEFAULT_PARAMS.virtual_tok),
    circulating: 0n,
    floor_lamports_per_token: "0",
    price_lamports_per_token: "0",
    mcap_sol: 0n,
    holders_count: 0,
    total_redeemed_sol: 0n,
    redeem_count: 0,
    buy_count: 0,
    sell_count: 0,
    volume_sol: 0n,
    brake_engaged: false,
    brake_window_start: null,
    brake_epoch: 0,
    brake_engagements: 0,
    brake_ref_sol: 0n,
    brake_ref_tok: 0n,
    last_trade_ts: null,
    last_event_slot: 0,
    last_event_ts: null,
    updated_at: ts,
  };
}

/** Price ratio (lamports per base unit) of a row. */
export function rowPrice(row: Pick<CoinRow, "sol_reserves" | "token_reserves">): Ratio | null {
  return priceRatio(row.sol_reserves, row.token_reserves);
}

/** Floor ratio of a row: active floor after graduation, preview before. */
export function rowFloor(
  row: Pick<CoinRow, "phase" | "pool_sol" | "pool_tok" | "supply" | "queued" | "real_sol" | "tokens_sold">,
): Ratio | null {
  return row.phase === "graduated"
    ? floorRatio(row.pool_sol, row.supply, row.pool_tok, row.queued)
    : floorPreviewRatio(row.real_sol, row.tokens_sold);
}

/** Recompute every derived column from the state columns. */
export function withDerived(row: CoinRow): CoinRow {
  const price = rowPrice(row);
  const floor = rowFloor(row);
  const circ =
    row.phase === "graduated" ? circulating(row.supply, row.pool_tok, row.queued) : circulating(row.tokens_sold, 0n, row.queued);
  return {
    ...row,
    circulating: circ,
    price_lamports_per_token: price ? lamportsPerToken(price) : "0",
    floor_lamports_per_token: floor ? lamportsPerToken(floor) : "0",
    mcap_sol: mcapLamports(price, row.supply),
    brake_engaged: row.queued > 0n,
  };
}

const maxDate = (a: Date | null, b: Date): Date => (a && a.getTime() > b.getTime() ? a : b);

export function reduceCoin(prev: CoinRow | null, ev: FlooredEvent, ctx: ReduceContext): CoinRow {
  const mint = ev.data.mint;
  const base = prev ?? emptyCoin(mint, ctx.ts);
  const slot = Number(ev.data.slot);
  const fresh = slot >= base.last_event_slot;
  let row: CoinRow = { ...base };
  let stateTouched = false;

  /** Apply state fields only when the event is not older than the row. */
  const setState = (patch: Partial<CoinRow>) => {
    if (!fresh) return;
    row = { ...row, ...patch };
    stateTouched = true;
  };

  switch (ev.name) {
    case "CoinCreated": {
      const e = ev.data;
      row = {
        ...row,
        coin: e.coin,
        creator: e.creator,
        name: e.name,
        symbol: e.symbol,
        uri: e.uri,
        params: paramsToJson(e.params),
        created_slot: slot,
        created_ts: new Date(Number(e.timestamp) * 1000),
      };
      // Initial state only if nothing newer has been projected yet.
      if (prev === null || base.last_event_slot === 0) {
        setState({
          phase: "curve",
          real_sol: 0n,
          tokens_sold: 0n,
          floor_reserve: 0n,
          pool_sol: 0n,
          pool_tok: 0n,
          queued: 0n,
          supply: e.supply,
          sol_reserves: e.params.virtual_sol,
          token_reserves: e.params.virtual_tok,
          brake_window_start: slot,
          brake_ref_sol: e.params.virtual_sol,
          brake_ref_tok: e.params.virtual_tok,
          brake_epoch: 0,
        });
      }
      break;
    }
    case "Trade": {
      const e = ev.data;
      if (e.is_buy) row.buy_count += 1;
      else row.sell_count += 1;
      row.volume_sol += e.sol_amount;
      row.last_trade_ts = maxDate(row.last_trade_ts, ctx.ts);
      const graduated = e.phase === 1;
      setState({
        phase: graduated ? "graduated" : "curve",
        real_sol: e.real_sol,
        floor_reserve: e.floor_reserve,
        pool_sol: e.pool_sol,
        pool_tok: e.pool_tok,
        queued: e.queued,
        supply: e.supply,
        sol_reserves: e.sol_reserves,
        token_reserves: e.token_reserves,
        tokens_sold: e.tokens_sold,
      });
      break;
    }
    case "Graduated": {
      const e = ev.data;
      row.graduated_slot = slot;
      row.graduated_ts = new Date(Number(e.timestamp) * 1000);
      setState({
        phase: "graduated",
        real_sol: 0n,
        floor_reserve: 0n,
        pool_sol: e.pool_sol,
        pool_tok: e.pool_tok,
        tokens_sold: e.tokens_sold,
        supply: e.supply,
        sol_reserves: e.pool_sol,
        token_reserves: e.pool_tok,
        // Graduation re-anchors the brake window on the pool reserves.
        brake_window_start: slot,
        brake_ref_sol: e.pool_sol,
        brake_ref_tok: e.pool_tok,
      });
      break;
    }
    case "Redeemed": {
      const e = ev.data;
      row.total_redeemed_sol += e.sol_out;
      row.redeem_count += 1;
      setState({
        phase: "graduated",
        pool_sol: e.pool_sol_after,
        pool_tok: e.pool_tok_after,
        supply: e.supply_after,
        queued: e.queued,
        sol_reserves: e.pool_sol_after,
        token_reserves: e.pool_tok_after,
      });
      break;
    }
    case "BrakeEngaged": {
      const e = ev.data;
      row.brake_engagements += 1;
      setState({
        queued: e.queued_total,
        brake_window_start: Number(e.window_start),
        brake_ref_sol: e.ref_sol,
        brake_ref_tok: e.ref_tok,
        brake_epoch: e.epoch,
      });
      break;
    }
    case "BrakeReleased": {
      const e = ev.data;
      // reason 0: a window fill emptied the queue and closed the epoch, a fresh one starts.
      // reason 1: the last position was cancelled / redeemed; the epoch stays open (empty).
      setState({ queued: 0n, brake_epoch: Math.max(row.brake_epoch, e.reason === 0 ? e.epoch + 1 : e.epoch) });
      break;
    }
    case "QueueJoined": {
      const e = ev.data;
      setState({ queued: e.queued_total, brake_epoch: e.epoch });
      break;
    }
    case "QueueProcessed": {
      const e = ev.data;
      setState({
        queued: e.queued_after,
        brake_window_start: Number(e.window_start),
        brake_epoch: e.closed_epoch ? e.epoch + 1 : e.epoch,
      });
      break;
    }
    case "QueueSettled": {
      const e = ev.data;
      setState({ queued: e.queued_after, brake_epoch: e.epoch });
      break;
    }
    case "FeesClaimed":
      break;
  }

  if (stateTouched) {
    row.last_event_slot = Math.max(row.last_event_slot, slot);
    row.last_event_ts = maxDate(row.last_event_ts, ctx.ts);
  }
  row.updated_at = ctx.ts;
  return withDerived(row);
}
