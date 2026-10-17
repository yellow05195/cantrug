/**
 * Build the coin row the UI expects from on-chain state alone. Used when no
 * indexer is configured (live mode, RPC only): header, key numbers, brake
 * banner and the floor line all keep working.
 */
import {
  circulating,
  coinFloorQ64,
  coinPriceQ64,
  floorQ64,
  q64ToLamportsPerToken,
  q64ToSolPerToken,
  reserves,
  valueAtQ64,
  windowStart,
} from "@floored/sdk";
import type { CoinJson, PriceJson } from "@/lib/api/types";
import { paramsJson } from "@/lib/mock/serialize";
import type { CoinChain, TokenMeta } from "./reads";

const SLOT_MS = 400;

function priceJson(q64: bigint): PriceJson | null {
  if (q64 === 0n) return null;
  const s = q64ToSolPerToken(q64);
  return {
    sol_per_token: s.toPrecision(12),
    lamports_per_token: q64ToLamportsPerToken(q64).toPrecision(12),
    lamports_per_base_unit: (q64ToLamportsPerToken(q64) / 1e6).toPrecision(12),
    display: s,
  };
}

export function coinJsonFromChain(chain: CoinChain, meta: TokenMeta | null): CoinJson {
  const s = chain.state;
  const supply = chain.supply;
  const r = reserves(s);
  const pq = coinPriceQ64(s);
  const fq = coinFloorQ64(s, supply);
  const graduated = s.phase === 1;
  const circ = supply >= s.poolTok + s.brake.queuedTotal ? circulating(supply, s.poolTok, s.brake.queuedTotal) : 0n;
  const preview = !graduated && s.tokensSold > 0n ? floorQ64(s.realSol + s.floorReserve, s.tokensSold) : 0n;
  const len = s.params.brakeWindowSlots;
  const cur = windowStart(s.brake.windowStart, len, chain.slot);
  const next = cur + len;
  const remaining = Number(next - chain.slot);
  const eta = (remaining * SLOT_MS) / 1000;
  const solD = (v: bigint) => Number(v) / 1e9;
  const tokD = (v: bigint) => Number(v) / 1e6;
  const slotToIso = (slot: bigint) => new Date(chain.readAt - Number(chain.slot - slot) * SLOT_MS).toISOString();
  const mcap = valueAtQ64(pq, supply);
  return {
    mint: s.mint.toBase58(),
    coin: s.mint.toBase58(),
    creator: s.creator.toBase58(),
    name: meta?.name || "Unnamed coin",
    symbol: meta?.symbol || "?",
    uri: meta?.uri ?? "",
    image_url: meta?.image ?? null,
    description: meta?.description ?? null,
    params: paramsJson(s.params),
    phase: graduated ? "graduated" : "curve",
    created_slot: Number(s.createdSlot),
    created_at: slotToIso(s.createdSlot),
    graduated_slot: graduated ? Number(s.graduatedSlot) : null,
    graduated_at: graduated ? slotToIso(s.graduatedSlot) : null,
    real_sol: s.realSol.toString(),
    real_sol_display: solD(s.realSol),
    floor_reserve: s.floorReserve.toString(),
    floor_reserve_display: solD(s.floorReserve),
    pool_sol: s.poolSol.toString(),
    pool_sol_display: solD(s.poolSol),
    tokens_sold: s.tokensSold.toString(),
    tokens_sold_display: tokD(s.tokensSold),
    pool_tok: s.poolTok.toString(),
    pool_tok_display: tokD(s.poolTok),
    queued: s.brake.queuedTotal.toString(),
    queued_display: tokD(s.brake.queuedTotal),
    supply: supply.toString(),
    supply_display: tokD(supply),
    circulating: circ.toString(),
    circulating_display: tokD(circ),
    sol_reserves: r.sol.toString(),
    sol_reserves_display: solD(r.sol),
    token_reserves: r.tok.toString(),
    token_reserves_display: tokD(r.tok),
    mcap_sol: mcap.toString(),
    mcap_sol_display: solD(mcap),
    volume_sol: s.volumeSol.toString(),
    volume_sol_display: solD(s.volumeSol),
    total_redeemed_sol: s.totalRedeemedSol.toString(),
    total_redeemed_sol_display: solD(s.totalRedeemedSol),
    price: priceJson(pq),
    floor: graduated ? priceJson(fq) : null,
    floor_active: graduated,
    floor_preview: graduated ? null : priceJson(preview),
    gap_bps: graduated && pq > 0n ? Number(10_000n - (fq * 10_000n) / pq) : null,
    graduation_progress_bps: graduated ? 10_000 : Number((s.realSol * 10_000n) / (s.params.graduationSol || 1n)),
    holders_count: null,
    redeem_count: Number(s.redeemCount),
    buy_count: Number(s.buyCount),
    sell_count: Number(s.sellCount),
    brake: {
      engaged: s.brake.queuedTotal > 0n,
      epoch: s.brake.epoch,
      engagements: s.brake.engagements,
      drop_bps: s.params.brakeDropBps,
      window_slots: Number(len),
      window_start: Number(s.brake.windowStart),
      ref_price: priceJson(s.brake.refTok > 0n ? floorQ64(s.brake.refSol, s.brake.refTok) : 0n),
      queued: s.brake.queuedTotal.toString(),
      queued_display: tokD(s.brake.queuedTotal),
      window: {
        window_slots: Number(len),
        est_current_slot: Number(chain.slot),
        current_window_start: Number(cur),
        next_window_start: Number(next),
        slots_remaining: remaining,
        eta_seconds: eta,
        eta_ts: new Date(chain.readAt + eta * 1000).toISOString(),
      },
    },
    last_trade_at: null,
    last_event_slot: Number(chain.slot),
    updated_at: new Date(chain.readAt).toISOString(),
    socials: meta?.socials ?? null,
  };
}
