"use client";
import { useEffect, useState } from "react";
import { subscribe } from "@/lib/api/ws";
import type { CoinJson, TradeJson, WsBrakeEngaged, WsMessage, WsQueueProcessed, WsRedeemed, WsTrade } from "@/lib/api/types";
import { metricsFromJson } from "@/lib/coin/metrics";

/**
 * Apply a websocket event to a coin row. Trade events carry the full
 * reserves after the trade, so the row is exact again after each one.
 */
export function applyEvent(c: CoinJson, m: WsMessage): CoinJson {
  if (m.mint !== c.mint) return c;
  switch (m.type) {
    case "Trade": {
      const d = m.data as unknown as WsTrade;
      const next: CoinJson = {
        ...c,
        phase: d.phase === 1 ? "graduated" : c.phase,
        floor_active: d.phase === 1 || c.floor_active,
        sol_reserves: d.sol_reserves,
        token_reserves: d.token_reserves,
        real_sol: d.real_sol,
        floor_reserve: d.floor_reserve,
        pool_sol: d.pool_sol,
        pool_tok: d.pool_tok,
        queued: d.queued,
        supply: d.supply,
        volume_sol: (BigInt(c.volume_sol || "0") + BigInt(d.sol_amount)).toString(),
        last_trade_at: m.ts,
        brake: { ...c.brake, queued: d.queued, queued_display: Number(d.queued) / 1e6, engaged: BigInt(d.queued) > 0n },
      };
      return refresh(next);
    }
    case "Redeemed": {
      const d = m.data as unknown as WsRedeemed;
      return refresh({
        ...c,
        pool_sol: d.pool_sol_after,
        pool_tok: d.pool_tok_after,
        supply: d.supply_after,
        total_redeemed_sol: (BigInt(c.total_redeemed_sol || "0") + BigInt(d.sol_out)).toString(),
        redeem_count: c.redeem_count + 1,
        sol_reserves: c.phase === "graduated" ? d.pool_sol_after : c.sol_reserves,
        token_reserves: c.phase === "graduated" ? d.pool_tok_after : c.token_reserves,
      });
    }
    case "BrakeEngaged": {
      const d = m.data as unknown as WsBrakeEngaged;
      return { ...c, brake: { ...c.brake, engaged: true, queued: d.queued_total, queued_display: Number(d.queued_total) / 1e6, epoch: d.epoch, engagements: c.brake.engagements + 1, window_start: Number(d.window_start) } };
    }
    case "QueueProcessed": {
      const d = m.data as unknown as WsQueueProcessed;
      const queued = d.queued_after;
      return {
        ...c,
        queued,
        brake: {
          ...c.brake,
          queued,
          queued_display: Number(queued) / 1e6,
          engaged: BigInt(queued) > 0n,
          epoch: d.closed_epoch ? d.epoch + 1 : d.epoch,
          window_start: Number(d.window_start),
          window: c.brake.window
            ? {
                ...c.brake.window,
                current_window_start: Number(d.window_start),
                next_window_start: Number(d.window_start) + c.brake.window_slots,
                eta_seconds: (c.brake.window_slots * 400) / 1000,
                eta_ts: new Date(Date.parse(m.ts) + c.brake.window_slots * 400).toISOString(),
              }
            : null,
        },
      };
    }
    case "BrakeReleased":
      return { ...c, queued: "0", brake: { ...c.brake, engaged: false, queued: "0", queued_display: 0 } };
    default:
      return c;
  }
}

/** Recompute the derived string fields (price, floor, circulating, mcap) after a patch. */
function refresh(c: CoinJson): CoinJson {
  const m = metricsFromJson(c);
  const price = { sol_per_token: String(m.priceSol), lamports_per_token: String(m.priceSol * 1e9), lamports_per_base_unit: String(m.priceSol * 1e3), display: m.priceSol };
  const floor = { sol_per_token: String(m.floorSol), lamports_per_token: String(m.floorSol * 1e9), lamports_per_base_unit: String(m.floorSol * 1e3), display: m.floorSol };
  return {
    ...c,
    circulating: m.circulating.toString(),
    mcap_sol: m.mcapLamports.toString(),
    mcap_sol_display: Number(m.mcapLamports) / 1e9,
    price,
    floor: m.phase === "graduated" ? floor : null,
    floor_preview: m.phase === "graduated" ? null : { ...floor, display: m.floorPreviewSol, sol_per_token: String(m.floorPreviewSol) },
    graduation_progress_bps: Math.round(m.progress * 10_000),
  };
}

/** A list of coins kept live by the websocket. */
export function useLiveCoins(initial: CoinJson[]): CoinJson[] {
  const [coins, setCoins] = useState(initial);
  const [seed, setSeed] = useState(initial);
  if (seed !== initial) {
    setSeed(initial);
    setCoins(initial);
  }
  useEffect(
    () =>
      subscribe("*", (m) => {
        setCoins((list) => {
          const i = list.findIndex((c) => c.mint === m.mint);
          if (i === -1) return list;
          const next = applyEvent(list[i]!, m);
          if (next === list[i]) return list;
          const copy = list.slice();
          copy[i] = next;
          return copy;
        });
      }),
    [],
  );
  return coins;
}

/** One coin kept live by the websocket. */
export function useLiveCoin(initial: CoinJson): [CoinJson, (c: CoinJson) => void] {
  const [coin, setCoin] = useState(initial);
  const [seed, setSeed] = useState(initial);
  if (seed !== initial) {
    setSeed(initial);
    setCoin(initial);
  }
  useEffect(() => subscribe(initial.mint, (m) => setCoin((c) => applyEvent(c, m))), [initial.mint]);
  return [coin, setCoin];
}

/** Turn a Trade / Redeemed frame into a feed row. */
export function tradeFromEvent(m: WsMessage, index: number): TradeJson | null {
  if (m.type === "Trade") {
    const d = m.data as unknown as WsTrade;
    return {
      signature: m.signature,
      event_index: index,
      user: d.user,
      side: d.is_buy ? "buy" : "sell",
      phase: d.phase === 1 ? "graduated" : "curve",
      is_queue_fill: d.is_queue_fill,
      sol_amount: d.sol_amount,
      sol_amount_display: Number(d.sol_amount) / 1e9,
      token_amount: d.token_amount,
      token_amount_display: Number(d.token_amount) / 1e6,
      fee_total: d.fee_total,
      fee_total_display: Number(d.fee_total) / 1e9,
      fee_to_floor: d.fee_to_floor,
      fee_to_floor_display: Number(d.fee_to_floor) / 1e9,
      queued_remainder: d.queued_remainder,
      queued_remainder_display: Number(d.queued_remainder) / 1e6,
      price_after: "0",
      price_after_display: 0,
      floor_after: "0",
      floor_after_display: 0,
      slot: m.slot,
      ts: m.ts,
      kind: "trade",
    };
  }
  if (m.type === "Redeemed") {
    const d = m.data as unknown as WsRedeemed;
    return {
      signature: m.signature,
      event_index: index,
      user: d.user,
      side: "sell",
      phase: "graduated",
      is_queue_fill: false,
      sol_amount: d.sol_out,
      sol_amount_display: Number(d.sol_out) / 1e9,
      token_amount: d.tokens_burned,
      token_amount_display: Number(d.tokens_burned) / 1e6,
      fee_total: d.fee_kept,
      fee_total_display: Number(d.fee_kept) / 1e9,
      fee_to_floor: d.fee_kept,
      fee_to_floor_display: Number(d.fee_kept) / 1e9,
      queued_remainder: "0",
      queued_remainder_display: 0,
      price_after: "0",
      price_after_display: 0,
      floor_after: "0",
      floor_after_display: 0,
      slot: m.slot,
      ts: m.ts,
      kind: "redeem",
    };
  }
  return null;
}
