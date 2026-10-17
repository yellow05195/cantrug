/**
 * Trade history straight from the chain (no indexer): signatures → transactions
 * → `parseEvents` → feed rows, with price and floor after each trade recomputed
 * from the event's reserves with the SDK.
 *
 * Public RPCs throttle getTransaction hard (batch calls get 429 quickly), so
 * transactions are read one by one with a short pause, and whatever was read is
 * kept if the RPC gives up.
 */
import { circulating, coinKeys, eventsOf, floorQ64, priceQ64, q64ToSolPerToken, type FlooredEvent } from "@floored/sdk";
import { PublicKey, type ConfirmedSignatureInfo } from "@solana/web3.js";
import type { TradeJson } from "@/lib/api/types";
import { parseFlooredEvents } from "./events";
import { connection } from "./reads";

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function eventsOfTx(signature: string): Promise<FlooredEvent[] | null> {
  const c = connection();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const tx = await c.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      return tx?.meta?.logMessages && !tx.meta.err ? parseFlooredEvents(tx.meta.logMessages) : [];
    } catch {
      await pause(900 * (attempt + 1));
    }
  }
  return null;
}

function rowsOf(mintStr: string, sig: string, events: FlooredEvent[]): TradeJson[] {
  const rows: TradeJson[] = [];
  let idx = 0;
  for (const t of eventsOf(events, "Trade")) {
    if (t.mint.toBase58() !== mintStr) continue;
    const price = t.tokenReserves > 0n ? q64ToSolPerToken(priceQ64(t.solReserves, t.tokenReserves)) : 0;
    const circ = t.supply >= t.poolTok + t.queued ? circulating(t.supply, t.poolTok, t.queued) : 0n;
    const floor = t.phase === 1 && circ > 0n ? q64ToSolPerToken(floorQ64(t.poolSol, circ)) : 0;
    rows.push({
      signature: sig,
      event_index: idx++,
      user: t.isQueueFill ? "queue" : t.user.toBase58(),
      side: t.isBuy ? "buy" : "sell",
      phase: t.phase === 1 ? "graduated" : "curve",
      is_queue_fill: t.isQueueFill,
      sol_amount: t.solAmount.toString(),
      sol_amount_display: Number(t.solAmount) / 1e9,
      token_amount: t.tokenAmount.toString(),
      token_amount_display: Number(t.tokenAmount) / 1e6,
      fee_total: t.feeTotal.toString(),
      fee_total_display: Number(t.feeTotal) / 1e9,
      fee_to_floor: t.feeToFloor.toString(),
      fee_to_floor_display: Number(t.feeToFloor) / 1e9,
      queued_remainder: t.queuedRemainder.toString(),
      queued_remainder_display: Number(t.queuedRemainder) / 1e6,
      price_after: String(price),
      price_after_display: price,
      floor_after: String(floor),
      floor_after_display: floor,
      slot: Number(t.slot),
      ts: new Date(Number(t.timestamp) * 1000).toISOString(),
      kind: "trade",
    });
  }
  for (const r of eventsOf(events, "Redeemed")) {
    if (r.mint.toBase58() !== mintStr) continue;
    const floor = r.circulatingAfter > 0n ? q64ToSolPerToken(floorQ64(r.poolSolAfter, r.circulatingAfter)) : 0;
    rows.push({
      signature: sig,
      event_index: idx++,
      user: r.user.toBase58(),
      side: "sell",
      phase: "graduated",
      is_queue_fill: false,
      sol_amount: r.solOut.toString(),
      sol_amount_display: Number(r.solOut) / 1e9,
      token_amount: r.tokensBurned.toString(),
      token_amount_display: Number(r.tokensBurned) / 1e6,
      fee_total: r.feeKept.toString(),
      fee_total_display: Number(r.feeKept) / 1e9,
      fee_to_floor: r.feeKept.toString(),
      fee_to_floor_display: Number(r.feeKept) / 1e9,
      queued_remainder: "0",
      queued_remainder_display: 0,
      price_after: "0",
      price_after_display: 0,
      floor_after: String(floor),
      floor_after_display: floor,
      slot: Number(r.slot),
      ts: new Date(Number(r.timestamp) * 1000).toISOString(),
      kind: "redeem",
    });
  }
  return rows;
}

async function rowsForSignatures(mintStr: string, sigs: ConfirmedSignatureInfo[], onProgress?: (rows: TradeJson[]) => void): Promise<TradeJson[]> {
  const rows: TradeJson[] = [];
  let failures = 0;
  for (const s of sigs) {
    if (s.err) continue;
    const ev = await eventsOfTx(s.signature);
    if (ev === null) {
      // Rate limited: back off, give up after three misses in a row.
      if (++failures >= 3) break;
      await pause(2500);
      continue;
    }
    failures = 0;
    rows.push(...rowsOf(mintStr, s.signature, ev));
    onProgress?.(sortRows(rows));
    await pause(220);
  }
  return sortRows(rows);
}

function sortRows(rows: TradeJson[]): TradeJson[] {
  return [...rows].sort((a, b) => a.slot - b.slot || a.event_index - b.event_index);
}

/** The latest `limit` events of a coin, oldest first. */
export async function readTradeHistory(mintStr: string, limit = 60, onProgress?: (rows: TradeJson[]) => void): Promise<TradeJson[]> {
  const { coin } = coinKeys(new PublicKey(mintStr));
  const sigs = await connection().getSignaturesForAddress(coin, { limit });
  return rowsForSignatures(mintStr, sigs, onProgress);
}

/**
 * The challenge episode without an indexer: find the dev's latest braked dump
 * from the dev wallet's own (short) history, then read the coin's transactions
 * around it: a few before, every queue fill after.
 */
export async function readChallengeHistory(mintStr: string, dev: string): Promise<TradeJson[]> {
  const c = connection();
  const devSigs = await c.getSignaturesForAddress(new PublicKey(dev), { limit: 25 });
  let dump: ConfirmedSignatureInfo | null = null;
  for (const s of devSigs) {
    if (s.err) continue;
    const ev = await eventsOfTx(s.signature);
    if (ev === null) break;
    const hit = eventsOf(ev, "Trade").some((t) => t.mint.toBase58() === mintStr && !t.isBuy && t.user.toBase58() === dev && t.queuedRemainder > 0n);
    if (hit) {
      dump = s;
      break;
    }
    await pause(220);
  }
  if (!dump) return readTradeHistory(mintStr, 60);
  const { coin } = coinKeys(new PublicKey(mintStr));
  const after = await c.getSignaturesForAddress(coin, { until: dump.signature, limit: 120 });
  const before = await c.getSignaturesForAddress(coin, { before: dump.signature, limit: 10 });
  return rowsForSignatures(mintStr, [...before.reverse(), dump, ...after.reverse()]);
}
