/**
 * Mock-mode state machine. It replays what the program does with the exact
 * @floored/sdk math (curve, pool, redeem, brake, queue) on an in-memory
 * `CoinState`, so every number the UI shows in mock mode is one the program
 * could have produced.
 */
import {
  DEFAULT_PARAMS,
  QueueAcc,
  TOTAL_SUPPLY,
  brakeAllowed,
  circulating,
  coinFloorQ64,
  coinPriceQ64,
  curveBuy,
  curveIsComplete,
  curveReserves,
  curveSell,
  entryOwed,
  entryRemaining,
  graduationPool,
  poolBuy,
  poolSell,
  q64ToSolPerToken,
  redeem as redeemMath,
  reserves,
  windowStart,
  type CoinState,
  type Params,
  type QueuePosition,
} from "@floored/sdk";
import type { PublicKey } from "@solana/web3.js";

export const SLOT_MS = 400;
/** Fixed genesis so slot numbers agree between server and client. */
export const GENESIS_MS = Date.UTC(2026, 8, 1);
export const GENESIS_SLOT = 380_000_000;

export function slotAt(ms: number): bigint {
  return BigInt(GENESIS_SLOT + Math.floor((ms - GENESIS_MS) / SLOT_MS));
}
export function msAtSlot(slot: bigint | number): number {
  return GENESIS_MS + (Number(slot) - GENESIS_SLOT) * SLOT_MS;
}

export interface MockMeta {
  name: string;
  symbol: string;
  description: string;
  image: string;
  socials: { website?: string; x?: string; telegram?: string };
  createdMs: number;
  graduatedMs: number | null;
}

export interface MockTrade {
  signature: string;
  user: string;
  kind: "buy" | "sell" | "fill" | "redeem";
  sol: bigint;
  tokens: bigint;
  feeTotal: bigint;
  feeToFloor: bigint;
  queuedRemainder: bigint;
  priceAfter: number;
  floorAfter: number;
  slot: bigint;
  ms: number;
  phase: 0 | 1;
}

export interface MockQueueEvent {
  signature: string;
  kind: "joined" | "processed" | "settled" | "engaged" | "released";
  user: string | null;
  epoch: number | null;
  amount: bigint | null;
  queuedTotal: bigint | null;
  sol: bigint | null;
  settleKind: number | null;
  windowStart: bigint | null;
  slot: bigint;
  ms: number;
}

export interface MockCoin {
  meta: MockMeta;
  state: CoinState;
  supply: bigint;
  holders: Map<string, bigint>;
  positions: Map<string, { pos: QueuePosition; joinedSlot: bigint; amountQueued: bigint }>;
  epochRecords: Map<number, bigint>;
  trades: MockTrade[];
  queueEvents: MockQueueEvent[];
  /** Per-trade floor/price samples for the floor endpoint. */
  samples: { ms: number; price: number; floor: number; poolSol: bigint; poolTok: bigint; circ: bigint; active: boolean }[];
}

/** Outgoing event, in the indexer websocket shape (snake_case, decimal strings). */
export interface EngineEvent {
  type: "Trade" | "Redeemed" | "BrakeEngaged" | "BrakeReleased" | "QueueJoined" | "QueueProcessed" | "QueueSettled" | "Graduated";
  signature: string;
  slot: bigint;
  ms: number;
  data: Record<string, unknown>;
}

export interface Ctx {
  slot: bigint;
  ms: number;
  sig: () => string;
  /** When false, nothing is appended to history arrays (quotes on a clone). */
  record: boolean;
  events: EngineEvent[];
}

const ZERO_BUMPS = {
  coin: 255,
  curveVault: 255,
  floorReserve: 255,
  poolSolVault: 255,
  feeVault: 255,
  queueSolVault: 255,
  curveTokenVault: 255,
  poolTokenVault: 255,
  queueEscrow: 255,
};

export function newCoinState(mint: PublicKey, creator: PublicKey, slot: bigint, params: Params = DEFAULT_PARAMS): CoinState {
  const r = curveReserves(params, { realSol: 0n, tokensSold: 0n });
  return {
    mint,
    creator,
    params: { ...params },
    phase: 0,
    realSol: 0n,
    tokensSold: 0n,
    floorReserve: 0n,
    poolSol: 0n,
    poolTok: 0n,
    creatorFeesOwed: 0n,
    protocolFeesOwed: 0n,
    creatorFeesClaimed: 0n,
    protocolFeesClaimed: 0n,
    totalRedeemedSol: 0n,
    redeemCount: 0n,
    totalPoolBurned: 0n,
    buyCount: 0n,
    sellCount: 0n,
    volumeSol: 0n,
    brake: {
      refSol: r.sol,
      refTok: r.tok,
      windowStart: slot,
      epoch: 0,
      scale: 1n << 64n,
      solIndex: 0n,
      queuedTotal: 0n,
      engagements: 0,
      windowsProcessed: 0,
    },
    createdSlot: slot,
    graduatedSlot: 0n,
    vaultRent: 0n,
    bumps: { ...ZERO_BUMPS },
  };
}

export function cloneState(s: CoinState): CoinState {
  return { ...s, params: { ...s.params }, brake: { ...s.brake }, bumps: { ...s.bumps } };
}

/** A copy that can be mutated freely to compute a preview. */
export function cloneCoin(c: MockCoin): MockCoin {
  return {
    meta: c.meta,
    state: cloneState(c.state),
    supply: c.supply,
    holders: new Map(c.holders),
    positions: new Map(c.positions),
    epochRecords: new Map(c.epochRecords),
    trades: [],
    queueEvents: [],
    samples: [],
  };
}

function acc(s: CoinState): QueueAcc {
  return new QueueAcc({ epoch: s.brake.epoch, scale: s.brake.scale, solIndex: s.brake.solIndex, queuedTotal: s.brake.queuedTotal });
}
function setAcc(s: CoinState, a: QueueAcc) {
  s.brake.epoch = a.epoch;
  s.brake.scale = a.scale;
  s.brake.solIndex = a.solIndex;
  s.brake.queuedTotal = a.queuedTotal;
}

export function priceFloor(c: MockCoin): { price: number; floor: number } {
  return {
    price: q64ToSolPerToken(coinPriceQ64(c.state)),
    floor: q64ToSolPerToken(coinFloorQ64(c.state, c.supply)),
  };
}

function addHolder(c: MockCoin, user: string, delta: bigint) {
  const v = (c.holders.get(user) ?? 0n) + delta;
  if (v <= 0n) c.holders.delete(user);
  else c.holders.set(user, v);
}

function sample(c: MockCoin, ctx: Ctx) {
  if (!ctx.record) return;
  const { price, floor } = priceFloor(c);
  const s = c.state;
  c.samples.push({
    ms: ctx.ms,
    price,
    floor,
    poolSol: s.poolSol,
    poolTok: s.poolTok,
    circ: circulating(c.supply, s.poolTok, s.brake.queuedTotal),
    active: s.phase === 1,
  });
}

function tradeEventData(c: MockCoin, user: string, isBuy: boolean, isFill: boolean, sol: bigint, tokens: bigint, fee: bigint, feeToFloor: bigint, remainder: bigint, ctx: Ctx) {
  const s = c.state;
  const r = reserves(s);
  return {
    mint: s.mint.toBase58(),
    user,
    is_buy: isBuy,
    phase: s.phase,
    is_queue_fill: isFill,
    sol_amount: sol.toString(),
    token_amount: tokens.toString(),
    fee_total: fee.toString(),
    fee_to_floor: feeToFloor.toString(),
    sol_reserves: r.sol.toString(),
    token_reserves: r.tok.toString(),
    real_sol: s.realSol.toString(),
    floor_reserve: s.floorReserve.toString(),
    pool_sol: s.poolSol.toString(),
    pool_tok: s.poolTok.toString(),
    queued: s.brake.queuedTotal.toString(),
    supply: c.supply.toString(),
    queued_remainder: remainder.toString(),
    slot: ctx.slot.toString(),
    timestamp: Math.floor(ctx.ms / 1000).toString(),
  };
}

function pushTrade(c: MockCoin, t: Omit<MockTrade, "priceAfter" | "floorAfter" | "slot" | "ms" | "phase">, ctx: Ctx) {
  if (!ctx.record) return;
  const { price, floor } = priceFloor(c);
  c.trades.push({ ...t, priceAfter: price, floorAfter: floor, slot: ctx.slot, ms: ctx.ms, phase: c.state.phase as 0 | 1 });
}

/** Sell `tokens` into the current venue, updating reserves. Returns SOL to the seller and the fee split. */
function rawSell(c: MockCoin, tokens: bigint): { solNet: bigint; feeTotal: bigint; feePool: bigint; creator: bigint; protocol: bigint } {
  const s = c.state;
  if (s.phase === 1) {
    const q = poolSell(s.params, { sol: s.poolSol, tok: s.poolTok }, tokens);
    s.poolSol = q.after.sol;
    s.poolTok = q.after.tok;
    return { solNet: q.solNet, feeTotal: q.fee.total, feePool: q.fee.pool, creator: q.fee.creator, protocol: q.fee.protocol };
  }
  const q = curveSell(s.params, { realSol: s.realSol, tokensSold: s.tokensSold }, tokens);
  s.realSol -= q.solGross;
  s.tokensSold -= tokens;
  s.floorReserve += q.fee.pool;
  return { solNet: q.solNet, feeTotal: q.fee.total, feePool: q.fee.pool, creator: q.fee.creator, protocol: q.fee.protocol };
}

/** `settle_window`: roll the brake window and serve the queue first, as the program does. */
export function settleWindow(c: MockCoin, ctx: Ctx): void {
  const s = c.state;
  const p = s.params;
  const ws = windowStart(s.brake.windowStart, p.brakeWindowSlots, ctx.slot);
  if (ws === s.brake.windowStart) return;
  s.brake.windowStart = ws;
  const r = reserves(s);
  s.brake.refSol = r.sol;
  s.brake.refTok = r.tok;
  if (s.brake.queuedTotal === 0n) return;
  const budget = brakeAllowed(p.brakeDropBps, r.sol, r.tok, r.sol, r.tok);
  const sold = budget < s.brake.queuedTotal ? budget : s.brake.queuedTotal;
  if (sold === 0n) return;
  const out = rawSell(c, sold);
  s.creatorFeesOwed += out.creator;
  s.protocolFeesOwed += out.protocol;
  s.sellCount += 1n;
  s.volumeSol += out.solNet;
  s.brake.windowsProcessed += 1;
  const epochBefore = s.brake.epoch;
  const { acc: next, fill } = acc(s).fill(sold, out.solNet);
  setAcc(s, next);
  if (fill.closedEpoch) c.epochRecords.set(fill.epoch, fill.finalSolIndex);
  const sig = ctx.sig();
  pushTrade(c, { signature: sig, user: "queue", kind: "fill", sol: out.solNet, tokens: sold, feeTotal: out.feeTotal, feeToFloor: out.feePool, queuedRemainder: 0n }, ctx);
  if (ctx.record) {
    c.queueEvents.push({ signature: sig, kind: "processed", user: null, epoch: epochBefore, amount: sold, queuedTotal: s.brake.queuedTotal, sol: out.solNet, settleKind: null, windowStart: ws, slot: ctx.slot, ms: ctx.ms });
    if (fill.closedEpoch) c.queueEvents.push({ signature: sig, kind: "released", user: null, epoch: epochBefore, amount: null, queuedTotal: 0n, sol: null, settleKind: null, windowStart: ws, slot: ctx.slot, ms: ctx.ms });
  }
  ctx.events.push({ type: "Trade", signature: sig, slot: ctx.slot, ms: ctx.ms, data: tradeEventData(c, "queue", false, true, out.solNet, sold, out.feeTotal, out.feePool, 0n, ctx) });
  ctx.events.push({
    type: "QueueProcessed",
    signature: sig,
    slot: ctx.slot,
    ms: ctx.ms,
    data: { mint: s.mint.toBase58(), caller: "crank", epoch: epochBefore, window_start: ws.toString(), sold: sold.toString(), sol_out: out.solNet.toString(), queued_after: s.brake.queuedTotal.toString(), closed_epoch: fill.closedEpoch, crank_reward: "0", slot: ctx.slot.toString() },
  });
  if (fill.closedEpoch) ctx.events.push({ type: "BrakeReleased", signature: sig, slot: ctx.slot, ms: ctx.ms, data: { mint: s.mint.toBase58(), epoch: epochBefore, slot: ctx.slot.toString() } });
  sample(c, ctx);
}

function graduate(c: MockCoin, ctx: Ctx) {
  const s = c.state;
  const pool = graduationPool(s.params, { realSol: s.realSol, tokensSold: s.tokensSold }, s.floorReserve);
  s.poolSol = pool.sol;
  s.poolTok = pool.tok;
  s.phase = 1;
  s.graduatedSlot = ctx.slot;
  const r = reserves(s);
  s.brake.refSol = r.sol;
  s.brake.refTok = r.tok;
  if (ctx.record) c.meta = { ...c.meta, graduatedMs: ctx.ms };
  ctx.events.push({
    type: "Graduated",
    signature: ctx.sig(),
    slot: ctx.slot,
    ms: ctx.ms,
    data: { mint: s.mint.toBase58(), caller: "crank", pool_sol: s.poolSol.toString(), pool_tok: s.poolTok.toString(), floor_reserve_added: s.floorReserve.toString(), tokens_sold: s.tokensSold.toString(), supply: c.supply.toString(), slot: ctx.slot.toString(), timestamp: Math.floor(ctx.ms / 1000).toString() },
  });
}

export interface BuyResult {
  solCharged: bigint;
  tokensOut: bigint;
  graduated: boolean;
}

export function buy(c: MockCoin, user: string, lamports: bigint, ctx: Ctx): BuyResult {
  settleWindow(c, ctx);
  const s = c.state;
  let solCharged: bigint;
  let tokensOut: bigint;
  let feeTotal: bigint;
  let feePool: bigint;
  let graduated = false;
  if (s.phase === 0) {
    const q = curveBuy(s.params, { realSol: s.realSol, tokensSold: s.tokensSold }, lamports);
    s.realSol += q.solNet;
    s.tokensSold += q.tokensOut;
    s.floorReserve += q.fee.pool;
    s.creatorFeesOwed += q.fee.creator;
    s.protocolFeesOwed += q.fee.protocol;
    solCharged = q.solCharged;
    tokensOut = q.tokensOut;
    feeTotal = q.fee.total;
    feePool = q.fee.pool;
  } else {
    const q = poolBuy(s.params, { sol: s.poolSol, tok: s.poolTok }, lamports);
    s.poolSol = q.after.sol;
    s.poolTok = q.after.tok;
    s.creatorFeesOwed += q.fee.creator;
    s.protocolFeesOwed += q.fee.protocol;
    solCharged = lamports;
    tokensOut = q.tokensOut;
    feeTotal = q.fee.total;
    feePool = q.fee.pool;
  }
  s.buyCount += 1n;
  s.volumeSol += solCharged;
  addHolder(c, user, tokensOut);
  const sig = ctx.sig();
  pushTrade(c, { signature: sig, user, kind: "buy", sol: solCharged, tokens: tokensOut, feeTotal, feeToFloor: feePool, queuedRemainder: 0n }, ctx);
  ctx.events.push({ type: "Trade", signature: sig, slot: ctx.slot, ms: ctx.ms, data: tradeEventData(c, user, true, false, solCharged, tokensOut, feeTotal, feePool, 0n, ctx) });
  sample(c, ctx);
  if (s.phase === 0 && curveIsComplete(s.params, { realSol: s.realSol, tokensSold: s.tokensSold })) {
    graduate(c, ctx);
    graduated = true;
    sample(c, ctx);
  }
  return { solCharged, tokensOut, graduated };
}

export interface SellResult {
  executed: bigint;
  queued: bigint;
  solOut: bigint;
}

export function sell(c: MockCoin, user: string, tokens: bigint, queueRemainder: boolean, ctx: Ctx): SellResult {
  settleWindow(c, ctx);
  const s = c.state;
  const r = reserves(s);
  const allowed = brakeAllowed(s.params.brakeDropBps, s.brake.refSol, s.brake.refTok, r.sol, r.tok);
  const executed = tokens < allowed ? tokens : allowed;
  let solOut = 0n;
  let feeTotal = 0n;
  let feePool = 0n;
  if (executed > 0n) {
    const out = rawSell(c, executed);
    s.creatorFeesOwed += out.creator;
    s.protocolFeesOwed += out.protocol;
    solOut = out.solNet;
    feeTotal = out.feeTotal;
    feePool = out.feePool;
    s.sellCount += 1n;
    s.volumeSol += solOut;
  }
  const braked = tokens - executed;
  const queued = queueRemainder ? braked : 0n;
  addHolder(c, user, -(executed + queued));
  const sig = ctx.sig();
  if (queued > 0n) {
    const wasEmpty = s.brake.queuedTotal === 0n;
    const { acc: next, position } = acc(s).join(queued);
    setAcc(s, next);
    const prev = c.positions.get(user);
    if (prev && prev.pos.epoch === position.epoch) {
      // Merge into the existing position: add shares, keep the owed SOL by
      // rebasing solIndexAtJoin (what the program does on a repeated join).
      const owed = entryOwed(prev.pos, s.brake.solIndex);
      const shares = prev.pos.shares + position.shares;
      const rebased = shares > 0n ? s.brake.solIndex - (owed * (1n << 64n)) / shares : s.brake.solIndex;
      c.positions.set(user, { pos: { epoch: position.epoch, shares, solIndexAtJoin: rebased }, joinedSlot: prev.joinedSlot, amountQueued: prev.amountQueued + queued });
    } else {
      c.positions.set(user, { pos: position, joinedSlot: ctx.slot, amountQueued: queued });
    }
    if (wasEmpty) {
      s.brake.engagements += 1;
      if (ctx.record) c.queueEvents.push({ signature: sig, kind: "engaged", user: null, epoch: s.brake.epoch, amount: null, queuedTotal: s.brake.queuedTotal, sol: null, settleKind: null, windowStart: s.brake.windowStart, slot: ctx.slot, ms: ctx.ms });
      ctx.events.push({ type: "BrakeEngaged", signature: sig, slot: ctx.slot, ms: ctx.ms, data: { mint: s.mint.toBase58(), window_start: s.brake.windowStart.toString(), ref_sol: s.brake.refSol.toString(), ref_tok: s.brake.refTok.toString(), queued_total: s.brake.queuedTotal.toString(), epoch: s.brake.epoch, slot: ctx.slot.toString() } });
    }
    if (ctx.record) c.queueEvents.push({ signature: sig, kind: "joined", user, epoch: s.brake.epoch, amount: queued, queuedTotal: s.brake.queuedTotal, sol: null, settleKind: null, windowStart: null, slot: ctx.slot, ms: ctx.ms });
    ctx.events.push({ type: "QueueJoined", signature: sig, slot: ctx.slot, ms: ctx.ms, data: { mint: s.mint.toBase58(), user, amount: queued.toString(), queued_total: s.brake.queuedTotal.toString(), epoch: s.brake.epoch, slot: ctx.slot.toString() } });
  }
  if (executed > 0n || queued > 0n) {
    pushTrade(c, { signature: sig, user, kind: "sell", sol: solOut, tokens: executed, feeTotal, feeToFloor: feePool, queuedRemainder: queued }, ctx);
    ctx.events.push({ type: "Trade", signature: sig, slot: ctx.slot, ms: ctx.ms, data: tradeEventData(c, user, false, false, solOut, executed, feeTotal, feePool, queued, ctx) });
    sample(c, ctx);
  }
  return { executed, queued, solOut };
}

export interface RedeemResult {
  solOut: bigint;
  feeKept: bigint;
}

function redeemInner(c: MockCoin, user: string, x: bigint, fromQueue: boolean, ctx: Ctx, sig: string): RedeemResult {
  const s = c.state;
  const q = redeemMath(s.params, { sol: s.poolSol, tok: s.poolTok }, s.brake.queuedTotal, c.supply, x);
  s.poolSol = q.after.sol;
  s.poolTok = q.after.tok;
  c.supply = q.supplyAfter;
  s.totalRedeemedSol += q.solOut;
  s.redeemCount += 1n;
  s.totalPoolBurned += q.poolBurn;
  pushTrade(c, { signature: sig, user, kind: "redeem", sol: q.solOut, tokens: x, feeTotal: q.feeKept, feeToFloor: q.feeKept, queuedRemainder: 0n }, ctx);
  ctx.events.push({
    type: "Redeemed",
    signature: sig,
    slot: ctx.slot,
    ms: ctx.ms,
    data: {
      mint: s.mint.toBase58(),
      user,
      tokens_burned: x.toString(),
      pool_tokens_burned: q.poolBurn.toString(),
      sol_out: q.solOut.toString(),
      fee_kept: q.feeKept.toString(),
      pool_sol_after: s.poolSol.toString(),
      pool_tok_after: s.poolTok.toString(),
      supply_after: c.supply.toString(),
      circulating_after: circulating(c.supply, s.poolTok, s.brake.queuedTotal).toString(),
      from_queue: fromQueue,
      slot: ctx.slot.toString(),
      timestamp: Math.floor(ctx.ms / 1000).toString(),
    },
  });
  sample(c, ctx);
  return { solOut: q.solOut, feeKept: q.feeKept };
}

export function redeem(c: MockCoin, user: string, x: bigint, ctx: Ctx): RedeemResult {
  settleWindow(c, ctx);
  const res = redeemInner(c, user, x, false, ctx, ctx.sig());
  addHolder(c, user, -x);
  return res;
}

/** Position of `user` right now: tokens still queued, SOL earned, stale flag. */
export function positionStatus(c: MockCoin, user: string): { remaining: bigint; owed: bigint; stale: boolean; epoch: number } | null {
  const e = c.positions.get(user);
  if (!e) return null;
  const s = c.state;
  if (e.pos.epoch === s.brake.epoch) {
    return { remaining: entryRemaining(e.pos, s.brake.scale), owed: entryOwed(e.pos, s.brake.solIndex), stale: false, epoch: e.pos.epoch };
  }
  const fin = c.epochRecords.get(e.pos.epoch) ?? 0n;
  return { remaining: 0n, owed: entryOwed(e.pos, fin), stale: true, epoch: e.pos.epoch };
}

/** kind 0 = claim (stay queued), 1 = cancel (take SOL + remaining tokens back), 2 = queue_to_redeem. */
export function settleQueue(c: MockCoin, user: string, kind: 0 | 1 | 2, ctx: Ctx): { sol: bigint; tokensReturned: bigint; tokensRedeemed: bigint } {
  settleWindow(c, ctx);
  const s = c.state;
  const st = positionStatus(c, user);
  if (!st) throw new Error("NotQueued");
  const sig = ctx.sig();
  let sol = st.owed;
  let tokensReturned = 0n;
  let tokensRedeemed = 0n;
  const e = c.positions.get(user)!;
  if (kind === 0 && !st.stale) {
    // Keep the shares, move the index forward.
    c.positions.set(user, { ...e, pos: { ...e.pos, solIndexAtJoin: s.brake.solIndex } });
  } else {
    if (!st.stale && st.remaining > 0n) {
      const { acc: next } = acc(s).leave(e.pos);
      setAcc(s, next);
      if (kind === 1) {
        tokensReturned = st.remaining;
        addHolder(c, user, st.remaining);
      } else {
        tokensRedeemed = st.remaining;
        if (s.phase === 1) sol += redeemInner(c, user, st.remaining, true, ctx, sig).solOut;
      }
    }
    c.positions.delete(user);
  }
  if (ctx.record) c.queueEvents.push({ signature: sig, kind: "settled", user, epoch: null, amount: tokensReturned + tokensRedeemed, queuedTotal: s.brake.queuedTotal, sol, settleKind: kind, windowStart: null, slot: ctx.slot, ms: ctx.ms });
  ctx.events.push({ type: "QueueSettled", signature: sig, slot: ctx.slot, ms: ctx.ms, data: { mint: s.mint.toBase58(), user, kind, tokens_returned: tokensReturned.toString(), tokens_redeemed: tokensRedeemed.toString(), sol_paid: sol.toString(), slot: ctx.slot.toString() } });
  return { sol, tokensReturned, tokensRedeemed };
}

export function newMockCoin(meta: MockMeta, mint: PublicKey, creator: PublicKey, params: Params = DEFAULT_PARAMS): MockCoin {
  const slot = slotAt(meta.createdMs);
  return {
    meta,
    state: newCoinState(mint, creator, slot, params),
    supply: TOTAL_SUPPLY,
    holders: new Map(),
    positions: new Map(),
    epochRecords: new Map(),
    trades: [],
    queueEvents: [],
    samples: [{ ms: meta.createdMs, price: q64ToSolPerToken(coinPriceQ64(newCoinState(mint, creator, slot, params))), floor: 0, poolSol: 0n, poolTok: 0n, circ: TOTAL_SUPPLY, active: false }],
  };
}
