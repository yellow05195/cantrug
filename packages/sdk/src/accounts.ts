/**
 * Account decoders (Borsh layouts of `programs/floored/src/state.rs`) and
 * derived read-side helpers: phase, reserves, floor, quotes, brake.
 */
import type { PublicKey } from "@solana/web3.js";
import { BorshReader, BorshWriter, accountDiscriminator } from "./borsh.js";
import {
  CoreError,
  QueueAcc,
  brakeAllowed,
  circulating,
  curveBuy,
  curveReserves,
  curveSell,
  entryOwed,
  entryRemaining,
  floorQ64,
  poolBuy,
  poolSell,
  priceQ64,
  redeem,
  windowStart,
  type CurveBuy,
  type CurveSell,
  type CurveState,
  type Params,
  type PoolBuy,
  type PoolSell,
  type PoolState,
  type QueuePosition,
  type Redeem,
} from "./math.js";
import { formatFloorGap, formatSolPerToken, priceFloorGapPct, q64ToLamportsPerToken } from "./format.js";

// ─────────────────────────────── discriminators ───────────────────────────────

export const ACCOUNT_NAMES = ["GlobalConfig", "CoinState", "QueueEntry", "EpochRecord"] as const;
export type AccountName = (typeof ACCOUNT_NAMES)[number];

export const ACCOUNT_DISCRIMINATORS: Readonly<Record<AccountName, Uint8Array>> = Object.freeze({
  GlobalConfig: accountDiscriminator("GlobalConfig"),
  CoinState: accountDiscriminator("CoinState"),
  QueueEntry: accountDiscriminator("QueueEntry"),
  EpochRecord: accountDiscriminator("EpochRecord"),
});

/** Byte sizes including the 8-byte discriminator (`8 + INIT_SPACE`). */
export const ACCOUNT_SIZES: Readonly<Record<AccountName, number>> = Object.freeze({
  GlobalConfig: 8 + 32 + 32 + 56 + 6 * 8 + 1 + 64,
  CoinState: 8 + 32 + 32 + 56 + 1 + 15 * 8 + 76 + 3 * 8 + 9 + 64,
  QueueEntry: 8 + 32 + 32 + 4 + 16 + 16 + 8 + 8 + 1,
  EpochRecord: 8 + 32 + 4 + 1 + 16 + 1,
});

export class AccountDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountDecodeError";
  }
}

function open(name: AccountName, data: Uint8Array): BorshReader {
  const want = ACCOUNT_DISCRIMINATORS[name];
  if (data.length < 8) throw new AccountDecodeError(`${name}: account data too short (${data.length} bytes)`);
  for (let i = 0; i < 8; i++) {
    if (data[i] !== want[i]) throw new AccountDecodeError(`${name}: discriminator mismatch`);
  }
  return new BorshReader(data, 8);
}

/** Which FLOORED account type `data` holds, from its discriminator, or null. */
export function identifyAccount(data: Uint8Array): AccountName | null {
  if (data.length < 8) return null;
  for (const name of ACCOUNT_NAMES) {
    const d = ACCOUNT_DISCRIMINATORS[name];
    let ok = true;
    for (let i = 0; i < 8; i++) if (data[i] !== d[i]) ok = false;
    if (ok) return name;
  }
  return null;
}

// ─────────────────────────────── CoinParams ───────────────────────────────

/** On-chain `CoinParams` (same shape as core `Params`). */
export type CoinParams = Params;

export function readCoinParams(r: BorshReader): CoinParams {
  return {
    virtualSol: r.u64(),
    virtualTok: r.u64(),
    curveSupply: r.u64(),
    graduationSol: r.u64(),
    curveFeeBps: r.u16(),
    curveFeeCreatorShareBps: r.u16(),
    curveFeeProtocolShareBps: r.u16(),
    poolFeeBps: r.u16(),
    poolFeePoolShareBps: r.u16(),
    poolFeeCreatorShareBps: r.u16(),
    redeemFeeBps: r.u16(),
    brakeDropBps: r.u16(),
    brakeWindowSlots: r.u64(),
  };
}

export function writeCoinParams(w: BorshWriter, p: CoinParams): BorshWriter {
  return w
    .u64(p.virtualSol)
    .u64(p.virtualTok)
    .u64(p.curveSupply)
    .u64(p.graduationSol)
    .u16(p.curveFeeBps)
    .u16(p.curveFeeCreatorShareBps)
    .u16(p.curveFeeProtocolShareBps)
    .u16(p.poolFeeBps)
    .u16(p.poolFeePoolShareBps)
    .u16(p.poolFeeCreatorShareBps)
    .u16(p.redeemFeeBps)
    .u16(p.brakeDropBps)
    .u64(p.brakeWindowSlots);
}

// ─────────────────────────────── GlobalConfig ───────────────────────────────

export interface GlobalConfig {
  authority: PublicKey;
  protocolFeeRecipient: PublicKey;
  params: CoinParams;
  crankReward: bigint;
  createFee: bigint;
  coinsCreated: bigint;
  coinsGraduated: bigint;
  totalRedeemedSol: bigint;
  totalRedeems: bigint;
  bump: number;
}

export function decodeGlobalConfig(data: Uint8Array): GlobalConfig {
  const r = open("GlobalConfig", data);
  const out: GlobalConfig = {
    authority: r.pubkey(),
    protocolFeeRecipient: r.pubkey(),
    params: readCoinParams(r),
    crankReward: r.u64(),
    createFee: r.u64(),
    coinsCreated: r.u64(),
    coinsGraduated: r.u64(),
    totalRedeemedSol: r.u64(),
    totalRedeems: r.u64(),
    bump: r.u8(),
  };
  r.bytes(64);
  return out;
}

// ─────────────────────────────── CoinState ───────────────────────────────

export interface BrakeState {
  refSol: bigint;
  refTok: bigint;
  windowStart: bigint;
  epoch: number;
  scale: bigint;
  solIndex: bigint;
  queuedTotal: bigint;
  engagements: number;
  windowsProcessed: number;
}

export interface Bumps {
  coin: number;
  curveVault: number;
  floorReserve: number;
  poolSolVault: number;
  feeVault: number;
  queueSolVault: number;
  curveTokenVault: number;
  poolTokenVault: number;
  queueEscrow: number;
}

export interface CoinState {
  mint: PublicKey;
  creator: PublicKey;
  params: CoinParams;
  /** 0 = curve, 1 = graduated. */
  phase: number;
  realSol: bigint;
  tokensSold: bigint;
  floorReserve: bigint;
  poolSol: bigint;
  poolTok: bigint;
  creatorFeesOwed: bigint;
  protocolFeesOwed: bigint;
  creatorFeesClaimed: bigint;
  protocolFeesClaimed: bigint;
  totalRedeemedSol: bigint;
  redeemCount: bigint;
  totalPoolBurned: bigint;
  buyCount: bigint;
  sellCount: bigint;
  volumeSol: bigint;
  brake: BrakeState;
  createdSlot: bigint;
  graduatedSlot: bigint;
  vaultRent: bigint;
  bumps: Bumps;
}

export function decodeCoinState(data: Uint8Array): CoinState {
  const r = open("CoinState", data);
  const out: CoinState = {
    mint: r.pubkey(),
    creator: r.pubkey(),
    params: readCoinParams(r),
    phase: r.u8(),
    realSol: r.u64(),
    tokensSold: r.u64(),
    floorReserve: r.u64(),
    poolSol: r.u64(),
    poolTok: r.u64(),
    creatorFeesOwed: r.u64(),
    protocolFeesOwed: r.u64(),
    creatorFeesClaimed: r.u64(),
    protocolFeesClaimed: r.u64(),
    totalRedeemedSol: r.u64(),
    redeemCount: r.u64(),
    totalPoolBurned: r.u64(),
    buyCount: r.u64(),
    sellCount: r.u64(),
    volumeSol: r.u64(),
    brake: {
      refSol: r.u64(),
      refTok: r.u64(),
      windowStart: r.u64(),
      epoch: r.u32(),
      scale: r.u128(),
      solIndex: r.u128(),
      queuedTotal: r.u64(),
      engagements: r.u32(),
      windowsProcessed: r.u32(),
    },
    createdSlot: r.u64(),
    graduatedSlot: r.u64(),
    vaultRent: r.u64(),
    bumps: {
      coin: r.u8(),
      curveVault: r.u8(),
      floorReserve: r.u8(),
      poolSolVault: r.u8(),
      feeVault: r.u8(),
      queueSolVault: r.u8(),
      curveTokenVault: r.u8(),
      poolTokenVault: r.u8(),
      queueEscrow: r.u8(),
    },
  };
  r.bytes(64);
  return out;
}

// ─────────────────────────────── QueueEntry / EpochRecord ───────────────────────────────

export interface QueueEntry {
  coin: PublicKey;
  owner: PublicKey;
  epoch: number;
  shares: bigint;
  solIndexAtJoin: bigint;
  joinedSlot: bigint;
  amountQueued: bigint;
  bump: number;
}

export function decodeQueueEntry(data: Uint8Array): QueueEntry {
  const r = open("QueueEntry", data);
  return {
    coin: r.pubkey(),
    owner: r.pubkey(),
    epoch: r.u32(),
    shares: r.u128(),
    solIndexAtJoin: r.u128(),
    joinedSlot: r.u64(),
    amountQueued: r.u64(),
    bump: r.u8(),
  };
}

/** Final accumulator of a closed queue epoch (not in the IDL; read manually by the program). */
export interface EpochRecord {
  coin: PublicKey;
  epoch: number;
  closed: boolean;
  finalSolIndex: bigint;
  bump: number;
}

export function decodeEpochRecord(data: Uint8Array): EpochRecord {
  const r = open("EpochRecord", data);
  return { coin: r.pubkey(), epoch: r.u32(), closed: r.bool(), finalSolIndex: r.u128(), bump: r.u8() };
}

// ─────────────────────────────── derived helpers ───────────────────────────────

export type Phase = "curve" | "graduated";

export function phase(coin: CoinState): Phase {
  return coin.phase === 1 ? "graduated" : "curve";
}

export function curveState(coin: CoinState): CurveState {
  return { realSol: coin.realSol, tokensSold: coin.tokensSold };
}

export function poolState(coin: CoinState): PoolState {
  return { sol: coin.poolSol, tok: coin.poolTok };
}

export function queueAcc(coin: CoinState): QueueAcc {
  return new QueueAcc({
    epoch: coin.brake.epoch,
    scale: coin.brake.scale,
    solIndex: coin.brake.solIndex,
    queuedTotal: coin.brake.queuedTotal,
  });
}

export function queuePosition(entry: QueueEntry): QueuePosition {
  return { epoch: entry.epoch, shares: entry.shares, solIndexAtJoin: entry.solIndexAtJoin };
}

/** Pricing reserves right now: virtual reserves on the curve, pool reserves after. */
export function reserves(coin: CoinState): PoolState {
  return phase(coin) === "curve" ? curveReserves(coin.params, curveState(coin)) : poolState(coin);
}

/** Share of the graduation SOL collected, 0..1 (1 once graduated). */
export function curveProgress(coin: CoinState): number {
  if (phase(coin) === "graduated") return 1;
  const g = coin.params.graduationSol;
  if (g === 0n) return 1;
  const r = coin.realSol >= g ? g : coin.realSol;
  return Number((r * 1_000_000n) / g) / 1_000_000;
}

/** `C`: tokens outside the pool and the queue. `supply` is the mint supply. */
export function circulatingSupply(coin: CoinState, supply: bigint): bigint {
  return circulating(supply, coin.poolTok, coin.brake.queuedTotal);
}

/** Floor as Q64.64 lamports per base unit; 0 before graduation or with nothing in circulation. */
export function coinFloorQ64(coin: CoinState, supply: bigint): bigint {
  if (phase(coin) === "curve") return 0n;
  const c = circulatingSupply(coin, supply);
  if (c === 0n) return 0n;
  return floorQ64(coin.poolSol, c);
}

/** Spot price as Q64.64 lamports per base unit (virtual reserves on the curve). */
export function coinPriceQ64(coin: CoinState): bigint {
  const { sol, tok } = reserves(coin);
  if (tok === 0n) return 0n;
  return priceQ64(sol, tok);
}

/** Floor in lamports per whole token (10^6 base units), as a float for display. */
export function floorLamportsPerToken(coin: CoinState, supply: bigint): number {
  return q64ToLamportsPerToken(coinFloorQ64(coin, supply));
}

/** Spot price in lamports per whole token, as a float for display. */
export function priceLamportsPerToken(coin: CoinState): number {
  return q64ToLamportsPerToken(coinPriceQ64(coin));
}

/** Exact quote of `redeem(x)` against the coin as it stands. Graduated coins only. */
export function redeemQuote(coin: CoinState, supply: bigint, x: bigint): Redeem {
  if (phase(coin) !== "graduated") throw new CoreError("CurveNotComplete", "redeem is only available after graduation");
  return redeem(coin.params, poolState(coin), coin.brake.queuedTotal, supply, x);
}

/** Exact quote of a buy (curve or pool, by phase) with `sol` lamports, fee included. */
export function buyQuote(coin: CoinState, sol: bigint): ({ venue: "curve" } & CurveBuy) | ({ venue: "pool" } & PoolBuy) {
  return phase(coin) === "curve"
    ? { venue: "curve", ...curveBuy(coin.params, curveState(coin), sol) }
    : { venue: "pool", ...poolBuy(coin.params, poolState(coin), sol) };
}

interface Sim {
  graduated: boolean;
  curve: CurveState;
  pool: PoolState;
  refSol: bigint;
  refTok: bigint;
  acc: QueueAcc;
  windowStart: bigint;
}

function simReserves(p: Params, s: Sim): PoolState {
  return s.graduated ? s.pool : curveReserves(p, s.curve);
}

function simSell(p: Params, s: Sim, tokens: bigint): CurveSell | PoolSell {
  if (s.graduated) {
    const q = poolSell(p, s.pool, tokens);
    s.pool = q.after;
    return q;
  }
  const q = curveSell(p, s.curve, tokens);
  s.curve = { realSol: s.curve.realSol - q.solGross, tokensSold: s.curve.tokensSold - tokens };
  return q;
}

/** Replays `settle_window` (window roll + aggregate queue fill) at `slot`. */
function simulate(coin: CoinState, slot?: bigint): { sim: Sim; queueFill: { sold: bigint; solOut: bigint } | null } {
  const p = coin.params;
  const sim: Sim = {
    graduated: phase(coin) === "graduated",
    curve: curveState(coin),
    pool: poolState(coin),
    refSol: coin.brake.refSol,
    refTok: coin.brake.refTok,
    acc: queueAcc(coin),
    windowStart: coin.brake.windowStart,
  };
  if (slot === undefined) return { sim, queueFill: null };
  const ws = windowStart(coin.brake.windowStart, p.brakeWindowSlots, slot);
  if (ws === coin.brake.windowStart) return { sim, queueFill: null };
  sim.windowStart = ws;
  const { sol: s, tok: t } = simReserves(p, sim);
  sim.refSol = s;
  sim.refTok = t;
  if (sim.acc.queuedTotal === 0n) return { sim, queueFill: null };
  const budget = brakeAllowed(p.brakeDropBps, s, t, s, t);
  const sold = budget < sim.acc.queuedTotal ? budget : sim.acc.queuedTotal;
  if (sold === 0n) return { sim, queueFill: null };
  const q = simSell(p, sim, sold);
  sim.acc = sim.acc.fill(sold, q.solNet).acc;
  return { sim, queueFill: { sold, solOut: q.solNet } };
}

/**
 * Tokens that can be sold right now without being queued by the brake.
 * Pass the current `slot` to account for a window that has elapsed (the
 * reference resets and the queue is served first, as the program does).
 */
export function brakeAllowedNow(coin: CoinState, slot?: bigint): bigint {
  const { sim } = simulate(coin, slot);
  const { sol, tok } = simReserves(coin.params, sim);
  return brakeAllowed(coin.params.brakeDropBps, sim.refSol, sim.refTok, sol, tok);
}

export interface SellQuote {
  venue: Phase;
  /** Part of the order that executes now. */
  executed: bigint;
  /** Part of the order the brake holds back (queued if `queue_remainder`, else not sold). */
  braked: bigint;
  /** Quote of the executed part, or null when nothing executes. */
  quote: CurveSell | PoolSell | null;
  /** Aggregate queue fill the program would run first, if a window elapsed. */
  queueFill: { sold: bigint; solOut: bigint } | null;
}

/** Quote `sell` / `swap_sell` of `tokens`, replaying the program's brake logic. */
export function sellQuote(coin: CoinState, tokens: bigint, slot?: bigint): SellQuote {
  if (tokens === 0n) throw new CoreError("ZeroAmount");
  const p = coin.params;
  const { sim, queueFill } = simulate(coin, slot);
  const { sol, tok } = simReserves(p, sim);
  const allowed = brakeAllowed(p.brakeDropBps, sim.refSol, sim.refTok, sol, tok);
  const executed = tokens < allowed ? tokens : allowed;
  const quote = executed > 0n ? simSell(p, sim, executed) : null;
  return { venue: sim.graduated ? "graduated" : "curve", executed, braked: tokens - executed, quote, queueFill };
}

/** Minimum `min_sol_out` for a slippage tolerance in bps, applied to a quoted amount. */
export function withSlippage(amount: bigint, slippageBps: number): bigint {
  const bps = BigInt(Math.max(0, Math.min(10_000, Math.floor(slippageBps))));
  return (amount * (10_000n - bps)) / 10_000n;
}

export interface QueueEntryStatus {
  /** Tokens still waiting in the queue. */
  remaining: bigint;
  /** SOL earned and not yet claimed. */
  owed: bigint;
  /** The entry's epoch is closed: settle it with claim_queue / cancel_queue (needs its EpochRecord). */
  stale: boolean;
}

/**
 * What a queue position is worth now. For an entry of a closed epoch, pass
 * that epoch's `EpochRecord`; without it `owed` cannot be computed and throws.
 */
export function queueEntryStatus(entry: QueueEntry, coin: CoinState, record?: EpochRecord | null): QueueEntryStatus {
  const pos = queuePosition(entry);
  if (entry.epoch === coin.brake.epoch) {
    return { remaining: entryRemaining(pos, coin.brake.scale), owed: entryOwed(pos, coin.brake.solIndex), stale: false };
  }
  if (!record || !record.closed || record.epoch !== entry.epoch) {
    throw new Error(`queue entry is from closed epoch ${entry.epoch}: its EpochRecord is required`);
  }
  return { remaining: 0n, owed: entryOwed(pos, record.finalSolIndex), stale: true };
}

export interface FloorDisplay {
  /** SOL per whole token, significant digits. */
  floor: string;
  price: string;
  /** (price − floor) / floor in percent, or null when there is no floor yet. */
  gapPct: number | null;
  /** "34 % above the floor" */
  gapText: string;
  floorQ64: bigint;
  priceQ64: bigint;
}

/** Everything a UI needs to show the floor next to the price. */
export function floorDisplay(coin: CoinState, supply: bigint, digits = 4): FloorDisplay {
  const fq = coinFloorQ64(coin, supply);
  const pq = coinPriceQ64(coin);
  const gap = priceFloorGapPct(pq, fq);
  return {
    floor: formatSolPerToken(fq, digits),
    price: formatSolPerToken(pq, digits),
    gapPct: gap,
    gapText: formatFloorGap(pq, fq),
    floorQ64: fq,
    priceQ64: pq,
  };
}

