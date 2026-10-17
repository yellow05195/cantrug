/**
 * Display helpers on top of @floored/sdk's exact formatters. Nothing here
 * computes protocol math; it only chooses how many digits a human sees.
 */
import { formatBps, formatSignificant, formatSol, formatTokensCompact, formatUnits, parseSol, parseTokens, shortAddress } from "@floored/sdk";

export { shortAddress };

/** Lamports → "12.4812" (truncated, never rounded up). */
export function sol(lamports: bigint, maxDecimals = 4): string {
  const abs = lamports < 0n ? -lamports : lamports;
  // Large amounts read better with fewer decimals.
  const d = abs >= 10_000n * 1_000_000_000n ? 0 : abs >= 100n * 1_000_000_000n ? 2 : maxDecimals;
  return formatSol(lamports, { maxDecimals: d, group: abs >= 10_000n * 1_000_000_000n ? " " : "" });
}

/** Lamports with fixed decimals (for counters that must not change width). */
export function solFixed(lamports: bigint, decimals = 2): string {
  return formatUnits(lamports, 9, { maxDecimals: decimals, minDecimals: decimals, group: " " });
}

/** Base units → "34.6M". */
export function tokens(base: bigint): string {
  return formatTokensCompact(base < 0n ? 0n : base);
}

/** Base units → exact-ish input string ("1234.56"). */
export function tokensInput(base: bigint): string {
  return formatUnits(base, 6, { maxDecimals: 6 });
}

export interface TinyParts {
  /** "0.0" before the subscript, or the whole string when no subscript is needed. */
  lead: string;
  zeros: number;
  digits: string;
}

/**
 * Tiny prices in the trader notation: 0.00000002812 → 0.0₇2812.
 * Returns parts so the subscript can be rendered as a real <sub>.
 */
export function tinyParts(value: number, sig = 4): TinyParts {
  if (!Number.isFinite(value) || value <= 0) return { lead: "0", zeros: 0, digits: "" };
  if (value >= 0.001) return { lead: formatSignificant(value, sig), zeros: 0, digits: "" };
  const exp = Math.floor(Math.log10(value));
  const zeros = -exp - 1;
  const digits = Math.round(value * 10 ** (-exp + sig - 1))
    .toString()
    .slice(0, sig)
    .replace(/0+$/, "");
  return { lead: "0.0", zeros, digits: digits || "0" };
}

const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";
export function tiny(value: number, sig = 4): string {
  const p = tinyParts(value, sig);
  if (!p.zeros) return p.lead;
  const sub = String(p.zeros)
    .split("")
    .map((d) => SUBSCRIPT[Number(d)])
    .join("");
  return `${p.lead}${sub}${p.digits}`;
}

/** Percent with sensible precision: 0.42 %, 3.4 %, 34 %. */
export function pct(value: number): string {
  const a = Math.abs(value);
  if (a === 0) return "0";
  const s = a >= 10 ? Math.round(a).toString() : a >= 1 ? a.toFixed(1).replace(/\.0$/, "") : a.toFixed(2).replace(/0$/, "");
  return `${value < 0 ? "-" : ""}${s}`;
}

/** SDK's formatBps with a no-break space, so "0.4 %" never wraps. */
export function bps(b: number): string {
  return formatBps(b).replace(" ", " ");
}

export function bpsPct(bps: number): string {
  return pct(bps / 100);
}

/** SOL as a compact number for big totals: 12 480 → "12.5K". */
export function solCompact(lamports: bigint): string {
  const v = Number(lamports) / 1e9;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (v >= 1e4) return `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}K`;
  return sol(lamports, v >= 100 ? 1 : 2);
}

export function countdown(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Relative age: "12s", "4m", "3h", "2d". Language-neutral units. */
export function age(iso: string | number | null | undefined, now = Date.now()): string {
  if (iso === null || iso === undefined) return "";
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function parseSolInput(text: string): bigint | null {
  try {
    return parseSol(text.replace(",", "."));
  } catch {
    return null;
  }
}

export function parseTokenInput(text: string): bigint | null {
  try {
    return parseTokens(text.replace(",", "."));
  } catch {
    return null;
  }
}
