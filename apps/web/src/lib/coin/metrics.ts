/**
 * Derived numbers for one coin, computed with @floored/sdk from exact integer
 * amounts. Two entry points: indexer JSON (lists, feeds) and on-chain
 * `CoinState` (coin page, exact quotes). No math is re-implemented here.
 */
import {
  circulating as circulatingOf,
  coinFloorQ64,
  coinPriceQ64,
  curveProgress,
  floorQ64,
  phase as phaseOf,
  priceFloorGapPct,
  priceQ64,
  q64ToSolPerToken,
  valueAtQ64,
  type CoinState,
} from "@floored/sdk";
import type { CoinJson, Phase } from "@/lib/api/types";

export interface CoinMetrics {
  phase: Phase;
  /** Spot price, Q64.64 lamports per base unit. */
  priceQ64: bigint;
  /** Redeemable floor, Q64.64; 0 on the curve. */
  floorQ64: bigint;
  /** On the curve: where the floor will start at graduation, (real SOL + floor reserve) / tokens sold. */
  floorPreviewQ64: bigint;
  /** (price − floor) / floor in percent; null without a floor. */
  gapPct: number | null;
  /** Share of the price that is guaranteed by the pool, 0..1 (floor / price). */
  guaranteedShare: number;
  priceSol: number;
  floorSol: number;
  floorPreviewSol: number;
  mcapLamports: bigint;
  poolSol: bigint;
  poolTok: bigint;
  queued: bigint;
  supply: bigint;
  circulating: bigint;
  realSol: bigint;
  floorReserve: bigint;
  tokensSold: bigint;
  /** Curve progress 0..1 (1 once graduated). */
  progress: number;
  graduationSol: bigint;
}

const big = (s: string | null | undefined): bigint => {
  if (!s) return 0n;
  try {
    return BigInt(s);
  } catch {
    return 0n;
  }
};

function finish(m: Omit<CoinMetrics, "gapPct" | "guaranteedShare" | "priceSol" | "floorSol" | "floorPreviewSol">): CoinMetrics {
  const gapPct = m.floorQ64 > 0n ? priceFloorGapPct(m.priceQ64, m.floorQ64) : null;
  const priceSol = q64ToSolPerToken(m.priceQ64);
  const floorSol = q64ToSolPerToken(m.floorQ64);
  const floorPreviewSol = q64ToSolPerToken(m.floorPreviewQ64);
  const guaranteedShare = priceSol > 0 && floorSol > 0 ? Math.min(1, floorSol / priceSol) : 0;
  return { ...m, gapPct, guaranteedShare, priceSol, floorSol, floorPreviewSol };
}

function preview(realSol: bigint, floorReserve: bigint, tokensSold: bigint): bigint {
  return tokensSold > 0n ? floorQ64(realSol + floorReserve, tokensSold) : 0n;
}

export function metricsFromJson(c: CoinJson): CoinMetrics {
  const phase = c.phase;
  const solRes = big(c.sol_reserves);
  const tokRes = big(c.token_reserves);
  const poolSol = big(c.pool_sol);
  const poolTok = big(c.pool_tok);
  const queued = big(c.queued);
  const supply = big(c.supply);
  const realSol = big(c.real_sol);
  const floorReserve = big(c.floor_reserve);
  const tokensSold = big(c.tokens_sold);
  const circ = supply >= poolTok + queued ? circulatingOf(supply, poolTok, queued) : 0n;
  const pq = tokRes > 0n ? priceQ64(solRes, tokRes) : 0n;
  const fq = phase === "graduated" && circ > 0n ? floorQ64(poolSol, circ) : 0n;
  const graduationSol = big(c.params?.graduation_sol ?? "85000000000");
  const progress =
    phase === "graduated" ? 1 : graduationSol > 0n ? Math.min(1, Number((realSol * 10_000n) / graduationSol) / 10_000) : 0;
  return finish({
    phase,
    priceQ64: pq,
    floorQ64: fq,
    floorPreviewQ64: phase === "curve" ? preview(realSol, floorReserve, tokensSold) : fq,
    mcapLamports: valueAtQ64(pq, supply),
    poolSol,
    poolTok,
    queued,
    supply,
    circulating: circ,
    realSol,
    floorReserve,
    tokensSold,
    progress,
    graduationSol,
  });
}

export function metricsFromChain(s: CoinState, supply: bigint): CoinMetrics {
  const phase = phaseOf(s);
  const pq = coinPriceQ64(s);
  const fq = coinFloorQ64(s, supply);
  const circ = supply >= s.poolTok + s.brake.queuedTotal ? circulatingOf(supply, s.poolTok, s.brake.queuedTotal) : 0n;
  return finish({
    phase,
    priceQ64: pq,
    floorQ64: fq,
    floorPreviewQ64: phase === "curve" ? preview(s.realSol, s.floorReserve, s.tokensSold) : fq,
    mcapLamports: valueAtQ64(pq, supply),
    poolSol: s.poolSol,
    poolTok: s.poolTok,
    queued: s.brake.queuedTotal,
    supply,
    circulating: circ,
    realSol: s.realSol,
    floorReserve: s.floorReserve,
    tokensSold: s.tokensSold,
    progress: curveProgress(s),
    graduationSol: s.params.graduationSol,
  });
}
