/**
 * Exact TypeScript port of `core/src/lib.rs` (floored-core).
 *
 * Every function mirrors its Rust counterpart line for line, with BigInt in
 * place of u64/u128. Rust's checked arithmetic is emulated explicitly: any
 * intermediate that would leave the u64 / u128 range throws
 * `CoreError("Overflow")`, exactly where the Rust code returns
 * `Err(CoreError::Overflow)`. Parity with the Rust crate is enforced by
 * `test/parity.test.ts` against `vectors.json`.
 *
 * Rounding rule, everywhere: in favour of the pool. Amounts paid out are
 * floored, fees are ceiled, pool tokens burned on redeem are ceiled.
 */

// ─────────────────────────────── constants ───────────────────────────────

/** Token decimals. 1 token = 10^6 base units. */
export const DECIMALS = 6;
/** 10^DECIMALS, base units per whole token. */
export const TOKEN_UNIT = 1_000_000n;
/** Total supply minted once at creation, in base units (1 000 000 000 tokens). */
export const TOTAL_SUPPLY = 1_000_000_000n * 1_000_000n;
export const LAMPORTS_PER_SOL = 1_000_000_000n;
/** Basis points denominator. */
export const BPS = 10_000n;
/** Fixed-point unit of the queue accumulator and of Q64.64 prices (2^64). */
export const SCALE_ONE = 1n << 64n;

export const U16_MAX = (1n << 16n) - 1n;
export const U32_MAX = (1n << 32n) - 1n;
export const U64_MAX = (1n << 64n) - 1n;
export const U128_MAX = (1n << 128n) - 1n;

// ─────────────────────────────── errors ───────────────────────────────

/** Variants of the Rust `CoreError` enum, same names. */
export type CoreErrorCode =
  | "Overflow"
  | "DivisionByZero"
  | "ZeroAmount"
  | "DustOutput"
  | "CurveComplete"
  | "CurveNotComplete"
  | "ExceedsAvailable"
  | "NothingInCirculation"
  | "InvalidParams"
  | "ExceedsQueue";

export const CORE_ERROR_CODES: readonly CoreErrorCode[] = [
  "Overflow",
  "DivisionByZero",
  "ZeroAmount",
  "DustOutput",
  "CurveComplete",
  "CurveNotComplete",
  "ExceedsAvailable",
  "NothingInCirculation",
  "InvalidParams",
  "ExceedsQueue",
];

export class CoreError extends Error {
  readonly code: CoreErrorCode;
  constructor(code: CoreErrorCode, message?: string) {
    super(message ?? `CoreError::${code}`);
    this.name = "CoreError";
    this.code = code;
  }
}

export function isCoreError(e: unknown, code?: CoreErrorCode): e is CoreError {
  return e instanceof CoreError && (code === undefined || e.code === code);
}

// ─────────────────────────────── params ───────────────────────────────

/**
 * Per-coin parameters (mirrors `floored_core::Params` and the on-chain
 * `CoinParams`). u64 fields are bigint, u16 fields are number.
 */
export interface Params {
  /** Virtual SOL reserve of the curve, lamports (default 30 SOL). */
  virtualSol: bigint;
  /** Virtual token reserve of the curve, base units (default 1 073 000 000 tokens). */
  virtualTok: bigint;
  /** Tokens sold on the curve before graduation (default 793 100 000 tokens). */
  curveSupply: bigint;
  /** Real SOL that completes the curve (default 85 SOL). */
  graduationSol: bigint;
  /** Curve trade fee (default 100 = 1 %). */
  curveFeeBps: number;
  /** Share of the curve fee that goes to the creator (default 4 000). */
  curveFeeCreatorShareBps: number;
  /** Share of the curve fee that goes to the protocol (default 3 000). The rest is the floor reserve. */
  curveFeeProtocolShareBps: number;
  /** Pool swap fee (default 50 = 0.5 %). */
  poolFeeBps: number;
  /** Share of the pool fee that stays in the pool (default 4 000). */
  poolFeePoolShareBps: number;
  /** Share of the pool fee that goes to the creator (default 4 000). The rest goes to the protocol. */
  poolFeeCreatorShareBps: number;
  /** Exit fee on `redeem`, kept in the pool (default 50 = 0.5 %). */
  redeemFeeBps: number;
  /** Maximum price drop per brake window (default 2 000 = 20 %). */
  brakeDropBps: number;
  /** Brake window length in slots (default 150). */
  brakeWindowSlots: bigint;
}

/** `Params::DEFAULT`. */
export const DEFAULT_PARAMS: Readonly<Params> = Object.freeze({
  virtualSol: 30n * LAMPORTS_PER_SOL,
  virtualTok: 1_073_000_000n * 1_000_000n,
  curveSupply: 793_100_000n * 1_000_000n,
  graduationSol: 85n * LAMPORTS_PER_SOL,
  curveFeeBps: 100,
  curveFeeCreatorShareBps: 4_000,
  curveFeeProtocolShareBps: 3_000,
  poolFeeBps: 50,
  poolFeePoolShareBps: 4_000,
  poolFeeCreatorShareBps: 4_000,
  redeemFeeBps: 50,
  brakeDropBps: 2_000,
  brakeWindowSlots: 150n,
});

/** Namespace-style alias so `Params.DEFAULT` reads like the Rust code. */
export const Params = Object.freeze({ DEFAULT: DEFAULT_PARAMS });

/** `Params::validate`. Throws `CoreError("InvalidParams")`. */
export function validateParams(p: Params): void {
  const b = (n: number) => BigInt(n);
  const ok =
    p.virtualSol > 0n &&
    p.virtualTok > p.curveSupply &&
    p.curveSupply > 0n &&
    p.curveSupply < TOTAL_SUPPLY &&
    p.graduationSol > 0n &&
    b(p.curveFeeBps) < BPS &&
    b(p.curveFeeCreatorShareBps) + b(p.curveFeeProtocolShareBps) <= BPS &&
    b(p.poolFeeBps) < BPS &&
    b(p.poolFeePoolShareBps) + b(p.poolFeeCreatorShareBps) <= BPS &&
    b(p.redeemFeeBps) < BPS &&
    p.brakeDropBps > 0 &&
    b(p.brakeDropBps) < BPS &&
    p.brakeWindowSlots > 0n;
  if (!ok) throw new CoreError("InvalidParams");
}

// ─────────────────────────────── integer helpers ───────────────────────────────

function u128(v: bigint): bigint {
  if (v < 0n || v > U128_MAX) throw new CoreError("Overflow");
  return v;
}

export function mulDivFloor(a: bigint, b: bigint, c: bigint): bigint {
  if (c === 0n) throw new CoreError("DivisionByZero");
  return u128(a * b) / c;
}

export function mulDivCeil(a: bigint, b: bigint, c: bigint): bigint {
  if (c === 0n) throw new CoreError("DivisionByZero");
  const p = u128(a * b);
  const q = p / c;
  return p % c === 0n ? q : u128(q + 1n);
}

/** `u64::try_from(v)` → `CoreError::Overflow`. */
export function toU64(v: bigint): bigint {
  if (v < 0n || v > U64_MAX) throw new CoreError("Overflow");
  return v;
}

function add64(a: bigint, b: bigint): bigint {
  return toU64(a + b);
}

function sub64(a: bigint, b: bigint): bigint {
  return toU64(a - b);
}

function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

/** `ceil(amount · bps / 10 000)`: fees always round up. */
export function feeCeil(amount: bigint, bps: number): bigint {
  return toU64(mulDivCeil(amount, BigInt(bps), BPS));
}

/** `floor(amount · bps / 10 000)`: shares of a fee round down. */
export function shareFloor(amount: bigint, bps: number): bigint {
  return toU64(mulDivFloor(amount, BigInt(bps), BPS));
}

function bitLength(n: bigint): number {
  return n.toString(2).length;
}

/** Integer square root, floor. Newton iteration, identical to the Rust code. */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new CoreError("Overflow");
  if (n < 2n) return n;
  const bits = bitLength(n);
  let x = 1n << BigInt(Math.ceil(bits / 2));
  for (;;) {
    let s = x + n / x;
    if (s > U128_MAX) s = U128_MAX; // saturating_add
    const y = s / 2n;
    if (y >= x) return x;
    x = y;
  }
}

// ─────────────────────────────── fee split ───────────────────────────────

/** Where a fee goes. `pool` is the part that stays with the holders. */
export interface FeeSplit {
  total: bigint;
  creator: bigint;
  protocol: bigint;
  pool: bigint;
}

export function splitCurveFee(p: Params, fee: bigint): FeeSplit {
  const creator = shareFloor(fee, p.curveFeeCreatorShareBps);
  const protocol = shareFloor(fee, p.curveFeeProtocolShareBps);
  const pool = sub64(sub64(fee, creator), protocol);
  return { total: fee, creator, protocol, pool };
}

export function splitPoolFee(p: Params, fee: bigint): FeeSplit {
  const pool = shareFloor(fee, p.poolFeePoolShareBps);
  const creator = shareFloor(fee, p.poolFeeCreatorShareBps);
  const protocol = sub64(sub64(fee, pool), creator);
  return { total: fee, creator, protocol, pool };
}

// ─────────────────────────────── the curve ───────────────────────────────

/** Live state of a coin on the curve. */
export interface CurveState {
  /** Real SOL collected (lamports), excluding fees. */
  realSol: bigint;
  /** Tokens sold so far (base units). */
  tokensSold: bigint;
}

/** Virtual reserves `{ sol: vs, tok: vt }` used for pricing on the curve. */
export function curveReserves(p: Params, s: CurveState): { sol: bigint; tok: bigint } {
  return { sol: add64(p.virtualSol, s.realSol), tok: sub64(p.virtualTok, s.tokensSold) };
}

export function curveIsComplete(p: Params, s: CurveState): boolean {
  return s.realSol >= p.graduationSol || s.tokensSold >= p.curveSupply;
}

export interface CurveBuy {
  /** SOL that enters the curve reserve. */
  solNet: bigint;
  fee: FeeSplit;
  /** Total the buyer is charged (`solNet + fee.total`). May be below what they offered (curve cap). */
  solCharged: bigint;
  tokensOut: bigint;
  /** The curve is complete after this buy; `graduate` can be called. */
  completes: boolean;
}

/** Quote a buy of at most `solMax` lamports (fee included) on the curve. */
export function curveBuy(p: Params, s: CurveState, solMax: bigint): CurveBuy {
  if (solMax === 0n) throw new CoreError("ZeroAmount");
  if (curveIsComplete(p, s)) throw new CoreError("CurveComplete");
  const { sol: vs, tok: vt } = curveReserves(p, s);
  const capacitySol = sub64(p.graduationSol, s.realSol);
  const remainingTokens = sub64(p.curveSupply, s.tokensSold);

  const feeBps = BigInt(p.curveFeeBps);
  let net = toU64(mulDivFloor(solMax, BPS, u128(BPS + feeBps)));
  while (net > 0n && add64(net, feeCeil(net, p.curveFeeBps)) > solMax) {
    net = sub64(net, 1n);
  }
  if (net === 0n) throw new CoreError("ZeroAmount");
  net = minBig(net, capacitySol);

  let tokensOut = toU64(mulDivFloor(vt, net, add64(vs, net)));
  if (tokensOut > remainingTokens) {
    tokensOut = remainingTokens;
    const need = toU64(mulDivCeil(vs, tokensOut, sub64(vt, tokensOut)));
    if (need > capacitySol) {
      net = capacitySol;
      tokensOut = toU64(mulDivFloor(vt, net, add64(vs, net)));
    } else {
      net = need;
    }
  }
  if (tokensOut === 0n) throw new CoreError("DustOutput");
  const fee = splitCurveFee(p, feeCeil(net, p.curveFeeBps));
  const solCharged = add64(net, fee.total);
  const after: CurveState = { realSol: add64(s.realSol, net), tokensSold: add64(s.tokensSold, tokensOut) };
  return { solNet: net, fee, solCharged, tokensOut, completes: curveIsComplete(p, after) };
}

export interface CurveSell {
  /** SOL leaving the curve reserve (before fee). */
  solGross: bigint;
  fee: FeeSplit;
  /** SOL the seller receives. */
  solNet: bigint;
}

/** Quote a sale of `tokensIn` base units into the curve. */
export function curveSell(p: Params, s: CurveState, tokensIn: bigint): CurveSell {
  if (tokensIn === 0n) throw new CoreError("ZeroAmount");
  if (tokensIn > s.tokensSold) throw new CoreError("ExceedsAvailable");
  const { sol: vs, tok: vt } = curveReserves(p, s);
  let gross = toU64(mulDivFloor(vs, tokensIn, add64(vt, tokensIn)));
  gross = minBig(gross, s.realSol);
  const fee = splitCurveFee(p, feeCeil(gross, p.curveFeeBps));
  const net = sub64(gross, fee.total);
  if (net === 0n) throw new CoreError("DustOutput");
  return { solGross: gross, fee, solNet: net };
}

// ─────────────────────────────── graduation ───────────────────────────────

/** Pool reserves opened at graduation. */
export function graduationPool(p: Params, s: CurveState, floorReserve: bigint): PoolState {
  if (!curveIsComplete(p, s)) throw new CoreError("CurveNotComplete");
  return { sol: add64(s.realSol, floorReserve), tok: sub64(TOTAL_SUPPLY, s.tokensSold) };
}

// ─────────────────────────────── the pool ───────────────────────────────

export interface PoolState {
  /** SOL in the pool, lamports (`S`). */
  sol: bigint;
  /** Tokens in the pool, base units (`T`). */
  tok: bigint;
}

export interface PoolBuy {
  solNet: bigint;
  fee: FeeSplit;
  tokensOut: bigint;
  after: PoolState;
}

/** Quote a pool buy with `solIn` lamports (fee included). */
export function poolBuy(p: Params, pool: PoolState, solIn: bigint): PoolBuy {
  if (solIn === 0n) throw new CoreError("ZeroAmount");
  if (pool.sol === 0n || pool.tok === 0n) throw new CoreError("ExceedsAvailable");
  const fee = splitPoolFee(p, feeCeil(solIn, p.poolFeeBps));
  const net = sub64(solIn, fee.total);
  if (net === 0n) throw new CoreError("ZeroAmount");
  const tokensOut = toU64(mulDivFloor(pool.tok, net, add64(pool.sol, net)));
  if (tokensOut === 0n) throw new CoreError("DustOutput");
  const after: PoolState = { sol: add64(add64(pool.sol, net), fee.pool), tok: sub64(pool.tok, tokensOut) };
  return { solNet: net, fee, tokensOut, after };
}

export interface PoolSell {
  solGross: bigint;
  fee: FeeSplit;
  solNet: bigint;
  after: PoolState;
}

/** Quote a pool sale of `tokensIn` base units. */
export function poolSell(p: Params, pool: PoolState, tokensIn: bigint): PoolSell {
  if (tokensIn === 0n) throw new CoreError("ZeroAmount");
  if (pool.sol === 0n || pool.tok === 0n) throw new CoreError("ExceedsAvailable");
  const gross = toU64(mulDivFloor(pool.sol, tokensIn, add64(pool.tok, tokensIn)));
  const fee = splitPoolFee(p, feeCeil(gross, p.poolFeeBps));
  const net = sub64(gross, fee.total);
  if (net === 0n) throw new CoreError("DustOutput");
  const after: PoolState = { sol: add64(sub64(pool.sol, gross), fee.pool), tok: add64(pool.tok, tokensIn) };
  return { solGross: gross, fee, solNet: net, after };
}

// ─────────────────────────────── the floor ───────────────────────────────

/** Tokens in circulation: everything outside the pool and the brake queue. */
export function circulating(supply: bigint, poolTok: bigint, queued: bigint): bigint {
  return sub64(sub64(supply, poolTok), queued);
}

/** Floor per token, Q64.64 lamports per base unit (`S · 2^64 / C`). */
export function floorQ64(poolSol: bigint, circ: bigint): bigint {
  return mulDivFloor(poolSol, SCALE_ONE, circ);
}

/** Pool price, Q64.64 lamports per base unit (`S · 2^64 / T`). */
export function priceQ64(sol: bigint, tok: bigint): bigint {
  return mulDivFloor(sol, SCALE_ONE, tok);
}

export interface Redeem {
  /** Circulating supply before the redemption (`C`). */
  circulating: bigint;
  /** Gross share of the pool, `floor(S · x / C)`. */
  solGross: bigint;
  /** Exit fee, stays in the pool. Zero for the last holder. */
  feeKept: bigint;
  /** SOL paid to the holder. */
  solOut: bigint;
  /** Pool tokens burned alongside, `ceil(T · x / C)` (all of `T` for the last holder). */
  poolBurn: bigint;
  after: PoolState;
  /** Mint supply after both burns. */
  supplyAfter: bigint;
}

/** Quote `redeem(x)`: burn `x` tokens, receive the exact share of the pool SOL. */
export function redeem(p: Params, pool: PoolState, queued: bigint, supply: bigint, x: bigint): Redeem {
  if (x === 0n) throw new CoreError("ZeroAmount");
  const c = circulating(supply, pool.tok, queued);
  if (c === 0n) throw new CoreError("NothingInCirculation");
  if (x > c) throw new CoreError("ExceedsAvailable");
  const last = x === c;
  const gross = last ? pool.sol : toU64(mulDivFloor(pool.sol, x, c));
  const feeKept = last ? 0n : feeCeil(gross, p.redeemFeeBps);
  const solOut = sub64(gross, feeKept);
  if (solOut === 0n) throw new CoreError("DustOutput");
  const poolBurn = last ? pool.tok : minBig(toU64(mulDivCeil(pool.tok, x, c)), pool.tok);
  const after: PoolState = { sol: sub64(pool.sol, solOut), tok: sub64(pool.tok, poolBurn) };
  const supplyAfter = sub64(sub64(supply, x), poolBurn);
  return { circulating: c, solGross: gross, feeKept, solOut, poolBurn, after, supplyAfter };
}

// ─────────────────────────────── the brake ───────────────────────────────

/**
 * How many tokens may still be sold into reserves `(sol, tok)` before the
 * price falls below `(1 − drop) ×` the reference price `refSol / refTok`.
 */
export function brakeAllowed(dropBps: number, refSol: bigint, refTok: bigint, sol: bigint, tok: bigint): bigint {
  if (refSol === 0n || refTok === 0n || sol === 0n || tok === 0n) return 0n;
  const keep = BPS - BigInt(dropBps);
  if (keep < 0n) throw new CoreError("InvalidParams");
  if (keep === 0n) throw new CoreError("InvalidParams");
  const r = mulDivFloor(sol, refTok, refSol);
  const tokMaxSq = mulDivFloor(u128(tok * r), BPS, keep);
  const tokMax = isqrt(tokMaxSq);
  const diff = tokMax > tok ? tokMax - tok : 0n; // saturating_sub
  return toU64(diff);
}

/** A seller's position in the queue. */
export interface QueuePosition {
  epoch: number;
  shares: bigint;
  solIndexAtJoin: bigint;
}

/** Result of one window fill. */
export interface QueueFill {
  /** The queue is empty after this fill; the epoch is closed. */
  closedEpoch: boolean;
  /** Final `solIndex` of the closed epoch (meaningful when `closedEpoch`). */
  finalSolIndex: bigint;
  /** Epoch number that was closed (or the current one when not closed). */
  epoch: number;
}

export interface QueueAccState {
  epoch: number;
  scale: bigint;
  solIndex: bigint;
  /** Tokens queued (base units), the `Q` of the floor formula. */
  queuedTotal: bigint;
}

/**
 * Pro-rata queue accumulator (`floored_core::QueueAcc`), immutable: every
 * mutating Rust method returns a fresh `QueueAcc` alongside its result.
 */
export class QueueAcc implements QueueAccState {
  readonly epoch: number;
  readonly scale: bigint;
  readonly solIndex: bigint;
  readonly queuedTotal: bigint;

  constructor(s: QueueAccState) {
    this.epoch = s.epoch;
    this.scale = s.scale;
    this.solIndex = s.solIndex;
    this.queuedTotal = s.queuedTotal;
  }

  /** `QueueAcc::default()`. */
  static default(): QueueAcc {
    return new QueueAcc({ epoch: 0, scale: SCALE_ONE, solIndex: 0n, queuedTotal: 0n });
  }

  private with(s: Partial<QueueAccState>): QueueAcc {
    return new QueueAcc({ ...this.toState(), ...s });
  }

  toState(): QueueAccState {
    return { epoch: this.epoch, scale: this.scale, solIndex: this.solIndex, queuedTotal: this.queuedTotal };
  }

  /** Add `amount` tokens to the queue; returns the position to store. */
  join(amount: bigint): { acc: QueueAcc; position: QueuePosition } {
    if (amount === 0n) throw new CoreError("ZeroAmount");
    if (this.scale === 0n) throw new CoreError("InvalidParams");
    const shares = mulDivFloor(amount, SCALE_ONE, this.scale);
    const queuedTotal = add64(this.queuedTotal, amount);
    return {
      acc: this.with({ queuedTotal }),
      position: { epoch: this.epoch, shares, solIndexAtJoin: this.solIndex },
    };
  }

  /** Record that the aggregate swap sold `sold` queued tokens for `solOut` lamports. */
  fill(sold: bigint, solOut: bigint): { acc: QueueAcc; fill: QueueFill } {
    if (sold === 0n) throw new CoreError("ZeroAmount");
    if (sold > this.queuedTotal) throw new CoreError("ExceedsQueue");
    const delta = mulDivFloor(solOut, this.scale, this.queuedTotal);
    const solIndex = u128(this.solIndex + delta);
    const remaining = sub64(this.queuedTotal, sold);
    const newScale = mulDivFloor(this.scale, remaining, this.queuedTotal);
    if (remaining === 0n || newScale === 0n) {
      if (BigInt(this.epoch) + 1n > U32_MAX) throw new CoreError("Overflow");
      return {
        acc: new QueueAcc({ epoch: this.epoch + 1, scale: SCALE_ONE, solIndex: 0n, queuedTotal: 0n }),
        fill: { closedEpoch: true, finalSolIndex: solIndex, epoch: this.epoch },
      };
    }
    return {
      acc: this.with({ scale: newScale, solIndex, queuedTotal: remaining }),
      fill: { closedEpoch: false, finalSolIndex: 0n, epoch: this.epoch },
    };
  }

  /** Remove a position still in the current epoch. Returns `[tokensRemaining, solOwed]` as named fields. */
  leave(pos: QueuePosition): { acc: QueueAcc; remaining: bigint; owed: bigint } {
    if (pos.epoch !== this.epoch) throw new CoreError("InvalidParams");
    const remaining = entryRemaining(pos, this.scale);
    const owed = entryOwed(pos, this.solIndex);
    return { acc: this.with({ queuedTotal: sub64(this.queuedTotal, remaining) }), remaining, owed };
  }
}

/** Tokens still queued behind a position, given the live (or final) `scale`. */
export function entryRemaining(pos: QueuePosition, scale: bigint): bigint {
  return toU64(mulDivFloor(pos.shares, scale, SCALE_ONE));
}

/** SOL earned by a position, given the live (or final) `solIndex`. */
export function entryOwed(pos: QueuePosition, solIndex: bigint): bigint {
  const d = solIndex - pos.solIndexAtJoin;
  if (d < 0n) throw new CoreError("Overflow");
  return toU64(mulDivFloor(pos.shares, d, SCALE_ONE));
}

/** Start of the window that contains `slot`, given the previous window start. */
export function windowStart(prevStart: bigint, windowSlots: bigint, slot: bigint): bigint {
  if (windowSlots === 0n || slot <= prevStart) return prevStart;
  const elapsed = slot - prevStart;
  const s = prevStart + (elapsed - (elapsed % windowSlots));
  return s > U64_MAX ? U64_MAX : s;
}
