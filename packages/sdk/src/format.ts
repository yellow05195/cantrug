/**
 * Display helpers. Amount formatting is exact (BigInt decimal shifting, no
 * float rounding); prices and floors are shown with significant digits.
 */
import { DECIMALS, LAMPORTS_PER_SOL, SCALE_ONE, TOKEN_UNIT } from "./math.js";

export interface AmountFormatOptions {
  /** Maximum fraction digits (extra digits are truncated, never rounded up). */
  maxDecimals?: number;
  /** Minimum fraction digits (zero padded). Default 0. */
  minDecimals?: number;
  /** Thousands separator for the integer part. Default "" (none). */
  group?: string;
}

/** Exact decimal rendering of `value / 10^decimals`, truncated to `maxDecimals`. */
export function formatUnits(value: bigint, decimals: number, opts: AmountFormatOptions = {}): string {
  const { maxDecimals = decimals, minDecimals = 0, group = "" } = opts;
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const unit = 10n ** BigInt(decimals);
  const int = abs / unit;
  let frac = decimals > 0 ? (abs % unit).toString().padStart(decimals, "0") : "";
  frac = frac.slice(0, Math.max(0, maxDecimals)).replace(/0+$/, "");
  if (frac.length < minDecimals) frac = frac.padEnd(minDecimals, "0");
  let intStr = int.toString();
  if (group) intStr = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const out = frac ? `${intStr}.${frac}` : intStr;
  return neg && out.replace(/[0.,\s]/g, "") !== "" ? `-${out}` : out;
}

/** Parse a decimal string into base units (`"1.5"`, 9 → 1 500 000 000n). Extra decimals are rejected. */
export function parseUnits(text: string, decimals: number): bigint {
  const s = text.trim().replace(/[\s_,]/g, "");
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[1] === "" && (m[2] ?? "") === "")) throw new Error(`invalid amount: "${text}"`);
  const intPart = m[1] || "0";
  const fracPart = m[2] ?? "";
  if (fracPart.length > decimals) throw new Error(`too many decimals in "${text}" (max ${decimals})`);
  return BigInt(intPart) * 10n ** BigInt(decimals) + BigInt(fracPart.padEnd(decimals, "0") || "0");
}

/** Lamports → SOL string (default up to 4 decimals, truncated). */
export function formatSol(lamports: bigint, opts: AmountFormatOptions = {}): string {
  return formatUnits(lamports, 9, { maxDecimals: 4, ...opts });
}

/** SOL string → lamports. */
export function parseSol(text: string): bigint {
  return parseUnits(text, 9);
}

/** Token base units → display string (6 decimals; default up to 2 shown, grouped with a thin space). */
export function formatTokens(base: bigint, opts: AmountFormatOptions = {}): string {
  return formatUnits(base, DECIMALS, { maxDecimals: 2, group: " ", ...opts });
}

/** Token display string → base units. */
export function parseTokens(text: string): bigint {
  return parseUnits(text, DECIMALS);
}

/** Compact token amount: 1.2K, 34.5M, 1B. */
export function formatTokensCompact(base: bigint): string {
  const whole = Number(base / TOKEN_UNIT) + Number(base % TOKEN_UNIT) / 1e6;
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [v, s] of units) {
    if (whole >= v) return `${trimZeros((whole / v).toFixed(whole / v >= 100 ? 0 : whole / v >= 10 ? 1 : 2))}${s}`;
  }
  return formatSignificant(whole, 4);
}

function trimZeros(s: string): string {
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/**
 * A number with `digits` significant digits, in plain decimal notation (no
 * exponent), trailing zeros trimmed: 0.000000028123 → "0.00000002812".
 */
export function formatSignificant(value: number, digits = 4): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  const neg = value < 0;
  const abs = Math.abs(value);
  const exp = Math.floor(Math.log10(abs));
  const decimals = Math.max(0, digits - 1 - exp);
  let s: string;
  if (decimals <= 100) {
    s = abs.toFixed(decimals);
    // toFixed can round up into one more integer digit; keep it, just trim.
  } else {
    s = abs.toPrecision(digits);
  }
  if (exp >= digits) {
    // Large numbers: round to `digits` significant digits, no fraction.
    const f = 10 ** (exp - digits + 1);
    s = (Math.round(abs / f) * f).toFixed(0);
  }
  s = trimZeros(s);
  return neg ? `-${s}` : s;
}

/** Q64.64 lamports per base unit → lamports per whole token (float, display only). */
export function q64ToLamportsPerToken(q64: bigint): number {
  if (q64 === 0n) return 0;
  const E = 10n ** 18n;
  const scaled = (q64 * TOKEN_UNIT * E) / SCALE_ONE;
  return Number(scaled / E) + Number(scaled % E) / 1e18;
}

/** Q64.64 lamports per base unit → SOL per whole token (float, display only). */
export function q64ToSolPerToken(q64: bigint): number {
  return q64ToLamportsPerToken(q64) / Number(LAMPORTS_PER_SOL);
}

/** Q64.64 lamports per base unit → "0.0000001234" SOL per token (significant digits). */
export function formatSolPerToken(q64: bigint, digits = 4): string {
  return formatSignificant(q64ToSolPerToken(q64), digits);
}

/** Alias: format a floor (Q64.64) as SOL per token. */
export const formatFloor = formatSolPerToken;
/** Alias: format a price (Q64.64) as SOL per token. */
export const formatPrice = formatSolPerToken;

/** Market cap / floor value of `supply` base units at a Q64.64 price, in lamports (exact, floored). */
export function valueAtQ64(q64: bigint, baseUnits: bigint): bigint {
  return (q64 * baseUnits) / SCALE_ONE;
}

/** `(price − floor) / floor` in percent, or null when there is no floor. */
export function priceFloorGapPct(priceQ64: bigint, floorQ64: bigint): number | null {
  if (floorQ64 === 0n) return null;
  // basis points with 2 extra digits of precision, exact in BigInt.
  const diff = priceQ64 - floorQ64;
  const scaled = (diff * 1_000_000n) / floorQ64; // percent × 10^4
  return Number(scaled) / 10_000;
}

/**
 * Human text for the gap between the price and the floor:
 * "34 % above the floor", "at the floor", "2.5 % below the floor", "no floor yet".
 */
export function formatFloorGap(priceQ64: bigint, floorQ64: bigint): string {
  const pct = priceFloorGapPct(priceQ64, floorQ64);
  if (pct === null) return "no floor yet";
  return formatGapPct(pct);
}

/** Format an already computed gap percentage (see `priceFloorGapPct`). */
export function formatGapPct(pct: number): string {
  const abs = Math.abs(pct);
  if (abs < 0.05) return "at the floor";
  const n = abs >= 10 ? Math.round(abs).toString() : trimZeros(abs.toFixed(1));
  return `${n} % ${pct > 0 ? "above" : "below"} the floor`;
}

/** Basis points → "0.5 %". */
export function formatBps(bps: number): string {
  return `${trimZeros((bps / 100).toFixed(2))} %`;
}

/** Shorten an address for display: "E7Zb…nc87". */
export function shortAddress(address: string | { toBase58(): string }, chars = 4): string {
  const s = typeof address === "string" ? address : address.toBase58();
  return s.length <= chars * 2 + 1 ? s : `${s.slice(0, chars)}…${s.slice(-chars)}`;
}
