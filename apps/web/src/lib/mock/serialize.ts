/**
 * MockCoin → indexer JSON. Same shapes as apps/indexer/src/api/serialize.ts,
 * so the UI cannot tell mock and live apart.
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
  type Params,
} from "@floored/sdk";
import type {
  BrakeJson,
  CandleInterval,
  CandleJson,
  CoinJson,
  CoinParamsJson,
  HoldersJson,
  PriceJson,
  QueueJson,
  SnapshotJson,
  TradeJson,
} from "@/lib/api/types";
import { SLOT_MS, msAtSlot, slotAt, type MockCoin, type MockTrade } from "./engine";

const solD = (v: bigint) => Number(v) / 1e9;
const tokD = (v: bigint) => Number(v) / 1e6;

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

export function paramsJson(p: Params): CoinParamsJson {
  return {
    virtual_sol: p.virtualSol.toString(),
    virtual_tok: p.virtualTok.toString(),
    curve_supply: p.curveSupply.toString(),
    graduation_sol: p.graduationSol.toString(),
    curve_fee_bps: p.curveFeeBps,
    curve_fee_creator_share_bps: p.curveFeeCreatorShareBps,
    curve_fee_protocol_share_bps: p.curveFeeProtocolShareBps,
    pool_fee_bps: p.poolFeeBps,
    pool_fee_pool_share_bps: p.poolFeePoolShareBps,
    pool_fee_creator_share_bps: p.poolFeeCreatorShareBps,
    redeem_fee_bps: p.redeemFeeBps,
    brake_drop_bps: p.brakeDropBps,
    brake_window_slots: p.brakeWindowSlots.toString(),
  };
}

export function brakeJson(c: MockCoin, now: number): BrakeJson {
  const s = c.state;
  const est = slotAt(now);
  const len = s.params.brakeWindowSlots;
  const cur = windowStart(s.brake.windowStart, len, est);
  const next = cur + len;
  const remaining = Number(next - est);
  const eta = (remaining * SLOT_MS) / 1000;
  return {
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
      est_current_slot: Number(est),
      current_window_start: Number(cur),
      next_window_start: Number(next),
      slots_remaining: remaining,
      eta_seconds: eta,
      eta_ts: new Date(now + eta * 1000).toISOString(),
    },
  };
}

export function coinJson(c: MockCoin, now: number): CoinJson {
  const s = c.state;
  const r = reserves(s);
  const pq = coinPriceQ64(s);
  const graduated = s.phase === 1;
  const fq = coinFloorQ64(s, c.supply);
  const circ = circulating(c.supply, s.poolTok, s.brake.queuedTotal);
  const preview = !graduated && s.tokensSold > 0n ? floorQ64(s.realSol + s.floorReserve, s.tokensSold) : 0n;
  const mcap = valueAtQ64(pq, c.supply);
  const dayAgo = now - 86_400_000;
  const vol24 = c.trades.filter((t) => t.ms >= dayAgo && t.kind !== "redeem").reduce((a, t) => a + t.sol, 0n);
  const last = c.trades[c.trades.length - 1];
  const amounts = (k: string, v: bigint, kind: "sol" | "tok") => ({ [k]: v.toString(), [`${k}_display`]: kind === "sol" ? solD(v) : tokD(v) });
  return {
    mint: s.mint.toBase58(),
    coin: s.mint.toBase58(),
    creator: s.creator.toBase58(),
    name: c.meta.name,
    symbol: c.meta.symbol,
    uri: "",
    image_url: c.meta.image,
    description: c.meta.description,
    params: paramsJson(s.params),
    phase: graduated ? "graduated" : "curve",
    created_slot: Number(s.createdSlot),
    created_at: new Date(c.meta.createdMs).toISOString(),
    graduated_slot: graduated ? Number(s.graduatedSlot) : null,
    graduated_at: graduated ? new Date(c.meta.graduatedMs ?? msAtSlot(s.graduatedSlot)).toISOString() : null,
    ...(amounts("real_sol", s.realSol, "sol") as { real_sol: string; real_sol_display: number }),
    ...(amounts("floor_reserve", s.floorReserve, "sol") as { floor_reserve: string; floor_reserve_display: number }),
    ...(amounts("pool_sol", s.poolSol, "sol") as { pool_sol: string; pool_sol_display: number }),
    ...(amounts("tokens_sold", s.tokensSold, "tok") as { tokens_sold: string; tokens_sold_display: number }),
    ...(amounts("pool_tok", s.poolTok, "tok") as { pool_tok: string; pool_tok_display: number }),
    ...(amounts("queued", s.brake.queuedTotal, "tok") as { queued: string; queued_display: number }),
    ...(amounts("supply", c.supply, "tok") as { supply: string; supply_display: number }),
    ...(amounts("circulating", circ, "tok") as { circulating: string; circulating_display: number }),
    ...(amounts("sol_reserves", r.sol, "sol") as { sol_reserves: string; sol_reserves_display: number }),
    ...(amounts("token_reserves", r.tok, "tok") as { token_reserves: string; token_reserves_display: number }),
    ...(amounts("mcap_sol", mcap, "sol") as { mcap_sol: string; mcap_sol_display: number }),
    ...(amounts("volume_sol", s.volumeSol, "sol") as { volume_sol: string; volume_sol_display: number }),
    ...(amounts("total_redeemed_sol", s.totalRedeemedSol, "sol") as { total_redeemed_sol: string; total_redeemed_sol_display: number }),
    price: priceJson(pq),
    floor: graduated ? priceJson(fq) : null,
    floor_active: graduated,
    floor_preview: graduated ? null : priceJson(preview),
    gap_bps: graduated && pq > 0n ? Number(10_000n - (fq * 10_000n) / pq) : null,
    graduation_progress_bps: graduated ? 10_000 : Number((s.realSol * 10_000n) / s.params.graduationSol),
    holders_count: c.holders.size,
    redeem_count: Number(s.redeemCount),
    buy_count: Number(s.buyCount),
    sell_count: Number(s.sellCount),
    brake: brakeJson(c, now),
    last_trade_at: last ? new Date(last.ms).toISOString() : null,
    last_event_slot: Number(last?.slot ?? s.createdSlot),
    updated_at: new Date(now).toISOString(),
    socials: c.meta.socials,
    volume_24h_sol: vol24.toString(),
  };
}

export function tradeJson(c: MockCoin, t: MockTrade, i: number): TradeJson {
  return {
    signature: t.signature,
    event_index: i,
    user: t.user,
    side: t.kind === "buy" ? "buy" : "sell",
    phase: t.phase === 1 ? "graduated" : "curve",
    is_queue_fill: t.kind === "fill",
    sol_amount: t.sol.toString(),
    sol_amount_display: solD(t.sol),
    token_amount: t.tokens.toString(),
    token_amount_display: tokD(t.tokens),
    fee_total: t.feeTotal.toString(),
    fee_total_display: solD(t.feeTotal),
    fee_to_floor: t.feeToFloor.toString(),
    fee_to_floor_display: solD(t.feeToFloor),
    queued_remainder: t.queuedRemainder.toString(),
    queued_remainder_display: tokD(t.queuedRemainder),
    price_after: t.priceAfter.toPrecision(12),
    price_after_display: t.priceAfter,
    floor_after: t.floorAfter.toPrecision(12),
    floor_after_display: t.floorAfter,
    slot: Number(t.slot),
    ts: new Date(t.ms).toISOString(),
    kind: t.kind === "redeem" ? "redeem" : "trade",
  };
}

const INTERVAL_MS: Record<CandleInterval, number> = { "1m": 60_000, "5m": 300_000, "1h": 3_600_000 };

export function candles(c: MockCoin, interval: CandleInterval, now: number): CandleJson[] {
  const step = INTERVAL_MS[interval];
  const out: CandleJson[] = [];
  const first = c.samples[0];
  if (!first) return out;
  let prevClose = first.price;
  let prevFloor = first.active ? first.floor : 0;
  const trades = c.trades;
  const startBucket = Math.floor(c.meta.createdMs / step) * step;
  const endBucket = Math.floor(now / step) * step;
  let ti = 0;
  // Cap the number of candles to keep payloads small.
  const maxBuckets = 600;
  const from = Math.max(startBucket, endBucket - step * maxBuckets);
  while (ti < trades.length && trades[ti]!.ms < from) {
    prevClose = trades[ti]!.priceAfter;
    prevFloor = trades[ti]!.floorAfter;
    ti++;
  }
  for (let b = from; b <= endBucket; b += step) {
    let o = prevClose;
    let h = prevClose;
    let l = prevClose;
    let cl = prevClose;
    let vol = 0n;
    let n = 0;
    let fl = prevFloor;
    while (ti < trades.length && trades[ti]!.ms < b + step) {
      const t = trades[ti]!;
      if (n === 0) o = prevClose;
      cl = t.priceAfter;
      h = Math.max(h, cl);
      l = Math.min(l, cl);
      fl = t.floorAfter;
      if (t.kind !== "redeem") vol += t.sol;
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

export function snapshots(c: MockCoin): SnapshotJson[] {
  return c.samples.map((s) => ({
    minute: new Date(s.ms).toISOString(),
    time: Math.floor(s.ms / 1000),
    floor: s.floor.toPrecision(12),
    floor_display: s.floor,
    price: s.price.toPrecision(12),
    price_display: s.price,
    floor_active: s.active,
    pool_sol: s.poolSol.toString(),
    pool_sol_display: solD(s.poolSol),
    pool_tok: s.poolTok.toString(),
    pool_tok_display: tokD(s.poolTok),
    circulating: s.circ.toString(),
    circulating_display: tokD(s.circ),
  }));
}

export function holdersJson(c: MockCoin): HoldersJson {
  const circ = circulating(c.supply, c.state.poolTok, c.state.brake.queuedTotal);
  const items = [...c.holders.entries()]
    .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
    .slice(0, 50)
    .map(([owner, bal]) => ({
      owner,
      balance: bal.toString(),
      balance_display: tokD(bal),
      share_of_supply_bps: Number((bal * 10_000n) / c.supply),
      share_of_circulating_bps: circ > 0n ? Number((bal * 10_000n) / circ) : null,
      last_updated: new Date().toISOString(),
    }));
  return { holders_count: c.holders.size, refreshed: true, items };
}

export function queueJson(c: MockCoin, now: number): QueueJson {
  const s = c.state;
  const entries = [...c.positions.entries()]
    .filter(([, e]) => e.pos.epoch === s.brake.epoch)
    .map(([user, e]) => {
      const est = (e.pos.shares * s.brake.scale) >> 64n;
      return { user, queued_estimate: est.toString(), queued_estimate_display: tokD(est), joined_total: e.amountQueued.toString(), last_slot: Number(e.joinedSlot) };
    })
    .sort((a, b) => b.queued_estimate_display - a.queued_estimate_display);
  const recent = [...c.queueEvents].slice(-50).reverse().map((e, i) => ({
    signature: e.signature,
    event_index: i,
    kind: e.kind,
    user: e.user,
    epoch: e.epoch,
    amount: e.amount?.toString() ?? null,
    amount_display: e.amount !== null ? tokD(e.amount) : null,
    queued_total: e.queuedTotal?.toString() ?? null,
    sol_amount: e.sol?.toString() ?? null,
    sol_amount_display: e.sol !== null ? solD(e.sol) : null,
    settle_kind: e.settleKind,
    window_start: e.windowStart !== null ? Number(e.windowStart) : null,
    data: {},
    slot: Number(e.slot),
    ts: new Date(e.ms).toISOString(),
  }));
  return { brake: brakeJson(c, now), entries, entries_note: "Mock data: exact positions.", recent };
}
