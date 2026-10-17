/**
 * Exact price / floor arithmetic on bigints. Mirrors floored-core:
 *   price  = sol_reserves / token_reserves   (lamports per base unit)
 *   floor  = pool_sol / circulating          (lamports per base unit)
 *   circulating = supply − pool_tok − queued
 * 1 token = 10^6 base units, 1 SOL = 10^9 lamports, so
 *   SOL per token = lamports per base unit × 10^6 / 10^9 = (num) / (den × 1000).
 */

export const TOKEN_DECIMALS = 6;
export const SOL_DECIMALS = 9;
export const BASE_UNITS_PER_TOKEN = 10n ** 6n;
export const LAMPORTS_PER_SOL = 10n ** 9n;
export const TOTAL_SUPPLY = 1_000_000_000n * BASE_UNITS_PER_TOKEN;
export const BPS = 10_000n;

/** Decimal places kept for each representation. */
export const SCALE_SOL_PER_TOKEN = 18;
export const SCALE_LAMPORTS_PER_TOKEN = 12;
export const SCALE_LAMPORTS_PER_BASE_UNIT = 18;

/** A non-negative rational number of lamports per base unit. */
export interface Ratio {
  num: bigint;
  den: bigint;
}

export function ratio(num: bigint, den: bigint): Ratio | null {
  if (den <= 0n || num < 0n) return null;
  return { num, den };
}

/** floor(num / den) rendered with `scale` decimals, trailing zeros trimmed. */
export function divToDecimal(num: bigint, den: bigint, scale: number): string {
  if (den === 0n) throw new RangeError("division by zero");
  const neg = num < 0n !== den < 0n && num !== 0n;
  const n = num < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  const scaled = (n * 10n ** BigInt(scale)) / d;
  let s = scaled.toString().padStart(scale + 1, "0");
  const int = s.slice(0, s.length - scale);
  let frac = s.slice(s.length - scale).replace(/0+$/, "");
  s = frac.length ? `${int}.${frac}` : int;
  if (neg && s !== "0") s = `-${s}`;
  return s;
}

/** Raw base-unit or lamport amount as a display number (lossy, display only). */
export function toDisplay(raw: bigint | string, decimals: number): number {
  const v = typeof raw === "bigint" ? raw : BigInt(raw);
  return Number(divToDecimal(v, 10n ** BigInt(decimals), decimals));
}

export const lamportsToSol = (v: bigint | string): number => toDisplay(v, SOL_DECIMALS);
export const baseUnitsToTokens = (v: bigint | string): number => toDisplay(v, TOKEN_DECIMALS);

export function solPerToken(r: Ratio): string {
  return divToDecimal(r.num, r.den * 1000n, SCALE_SOL_PER_TOKEN);
}
export function lamportsPerToken(r: Ratio): string {
  return divToDecimal(r.num * BASE_UNITS_PER_TOKEN, r.den, SCALE_LAMPORTS_PER_TOKEN);
}
export function lamportsPerBaseUnit(r: Ratio): string {
  return divToDecimal(r.num, r.den, SCALE_LAMPORTS_PER_BASE_UNIT);
}

/** Parse a decimal string (e.g. a numeric column) into a ratio. */
export function decimalToRatio(s: string): Ratio {
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(s.trim());
  if (!m) throw new RangeError(`not a decimal: ${s}`);
  const frac = m[3] ?? "";
  const num = BigInt(`${m[1]}${m[2] || "0"}${frac}`);
  return { num, den: 10n ** BigInt(frac.length) };
}

export function circulating(supply: bigint, poolTok: bigint, queued: bigint): bigint {
  const c = supply - poolTok - queued;
  return c > 0n ? c : 0n;
}

/** Pool / curve price: reserves ratio. */
export function priceRatio(solReserves: bigint, tokenReserves: bigint): Ratio | null {
  return ratio(solReserves, tokenReserves);
}

/** Active floor after graduation: pool SOL per circulating base unit. */
export function floorRatio(poolSol: bigint, supply: bigint, poolTok: bigint, queued: bigint): Ratio | null {
  return ratio(poolSol, circulating(supply, poolTok, queued));
}

/** Pre-graduation preview: real SOL per token sold (what holders would share if it graduated now, before fees). */
export function floorPreviewRatio(realSol: bigint, tokensSold: bigint): Ratio | null {
  return ratio(realSol, tokensSold);
}

/**
 * Gap between price and floor, in basis points of the price:
 *   gap_bps = (price − floor) / price × 10 000, rounded toward −∞.
 * Negative when the floor is above the price. Null when undefined.
 */
export function gapBps(price: Ratio | null, floor: Ratio | null): number | null {
  if (!price || !floor || price.num === 0n) return null;
  // 1 − floor/price = 1 − (fn · pd) / (fd · pn)
  const a = floor.num * price.den;
  const b = floor.den * price.num;
  return Number(floorDiv(BPS * (b - a), b));
}

function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  return (a % b !== 0n && (a < 0n) !== (b < 0n)) ? q - 1n : q;
}

/** Market cap in lamports: price × supply. */
export function mcapLamports(price: Ratio | null, supply: bigint): bigint {
  if (!price) return 0n;
  return (price.num * supply) / price.den;
}

/** Start of the brake window containing `slot` (floored_core::window_start). */
export function windowStart(prevStart: bigint, windowSlots: bigint, slot: bigint): bigint {
  if (windowSlots === 0n || slot <= prevStart) return prevStart;
  const elapsed = slot - prevStart;
  return prevStart + (elapsed - (elapsed % windowSlots));
}
