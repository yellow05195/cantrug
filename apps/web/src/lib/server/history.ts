/**
 * A coin's transaction history straight from the chain: signatures of the coin
 * PDA → transactions (batched) → program events. Kept per instance and refreshed
 * incrementally (only signatures newer than the last known one are fetched).
 */
import { circulating, coinKeys, floorQ64, priceQ64, q64ToSolPerToken, type FlooredEvent } from "@floored/sdk";
import { PublicKey, type ConfirmedSignatureInfo } from "@solana/web3.js";
import type { QueueEventJson, TradeJson, WsMessage } from "@/lib/api/types";
import { parseFlooredEvents } from "@/lib/chain/events";
import { mapLimit, serverConnection } from "./rpc";
import { eventFrame, solD, tokD } from "./serialize";

export interface TxEvents {
  signature: string;
  slot: number;
  /** Unix ms (block time, or the events' own timestamp). */
  ms: number;
  events: FlooredEvent[];
}

interface Hist {
  /** Newest first. */
  txs: TxEvents[];
  newest: string | null;
  at: number;
  inflight: Promise<TxEvents[]> | null;
}

const MAX_TXS = 3000;
const MAX_COINS = 60;
const FRESH_MS = 5000;
const hist = new Map<string, Hist>();

async function fetchTxs(sigs: ConfirmedSignatureInfo[]): Promise<TxEvents[]> {
  const c = serverConnection();
  const ok = sigs.filter((s) => !s.err);
  const chunks: ConfirmedSignatureInfo[][] = [];
  for (let i = 0; i < ok.length; i += 100) chunks.push(ok.slice(i, i + 100));
  const groups = await mapLimit(chunks, 3, async (chunk) => {
    const txs = await c.getTransactions(
      chunk.map((s) => s.signature),
      { commitment: "confirmed", maxSupportedTransactionVersion: 0 },
    );
    return txs.map((tx, i) => {
      const s = chunk[i]!;
      if (!tx || tx.meta?.err) return null;
      const events = parseFlooredEvents(tx.meta?.logMessages);
      const evTs = events.map((e) => Number((e.data as { timestamp?: bigint }).timestamp ?? 0n)).find((t) => t > 0);
      const ms = (tx.blockTime ?? s.blockTime ?? evTs ?? 0) * 1000;
      return { signature: s.signature, slot: tx.slot, ms, events };
    });
  });
  return groups.flat().filter((t): t is TxEvents => t !== null);
}

/** Signatures of `address`, newest first, stopping at `until` (exclusive) or after `max`. */
export async function signaturesOf(address: PublicKey, until: string | null, max: number): Promise<ConfirmedSignatureInfo[]> {
  const c = serverConnection();
  const out: ConfirmedSignatureInfo[] = [];
  let before: string | undefined;
  while (out.length < max) {
    const page = await c.getSignaturesForAddress(address, { limit: Math.min(1000, max - out.length), before, until: until ?? undefined }, "confirmed");
    out.push(...page);
    if (page.length < 1000) break;
    before = page[page.length - 1]!.signature;
  }
  return out;
}

/** The coin's transactions, newest first (up to MAX_TXS). */
export function coinHistory(mint: string): Promise<TxEvents[]> {
  const now = Date.now();
  let h = hist.get(mint);
  if (h && now - h.at < FRESH_MS) return Promise.resolve(h.txs);
  if (h?.inflight) return h.inflight;
  if (!h) {
    if (hist.size >= MAX_COINS) hist.delete(hist.keys().next().value as string);
    h = { txs: [], newest: null, at: 0, inflight: null };
    hist.set(mint, h);
  }
  const entry = h;
  entry.inflight = (async () => {
    try {
      const { coin } = coinKeys(new PublicKey(mint));
      const sigs = await signaturesOf(coin, entry.newest, entry.newest ? 1000 : MAX_TXS);
      if (sigs.length) {
        const fresh = await fetchTxs(sigs);
        const known = new Set(entry.txs.map((t) => t.signature));
        entry.txs = [...fresh.filter((t) => !known.has(t.signature)), ...entry.txs].sort((a, b) => b.slot - a.slot).slice(0, MAX_TXS);
        entry.newest = sigs[0]!.signature;
      }
      entry.at = Date.now();
      return entry.txs;
    } catch (e) {
      if (entry.txs.length) return entry.txs;
      hist.delete(mint);
      throw e;
    } finally {
      entry.inflight = null;
    }
  })();
  return entry.inflight;
}

/** One price/floor sample after an event, for candles and snapshots. */
export interface Tick {
  signature: string;
  slot: number;
  ms: number;
  kind: "trade" | "redeem";
  price: number;
  floor: number;
  active: boolean;
  poolSol: bigint;
  poolTok: bigint;
  circ: bigint;
  /** Lamports traded (0 for redeems). */
  volume: bigint;
}

export interface Derived {
  /** Newest first. */
  rows: TradeJson[];
  /** Oldest first. */
  ticks: Tick[];
  /** Newest first. */
  queue: QueueEventJson[];
  /** Oldest first. */
  frames: WsMessage[];
}

const derivedCache = new WeakMap<TxEvents[], Derived>();

const QUEUE_EVENTS = new Set(["QueueJoined", "QueueProcessed", "QueueSettled", "BrakeEngaged", "BrakeReleased"]);
const QUEUE_KIND: Record<string, QueueEventJson["kind"]> = {
  QueueJoined: "joined",
  QueueProcessed: "processed",
  QueueSettled: "settled",
  BrakeEngaged: "engaged",
  BrakeReleased: "released",
};

/** Trade rows, ticks, queue events and ws frames derived from the history (cached per history snapshot). */
export async function derive(mint: string): Promise<Derived> {
  const txs = await coinHistory(mint);
  const hit = derivedCache.get(txs);
  if (hit) return hit;
  const rows: TradeJson[] = [];
  const ticks: Tick[] = [];
  const queue: QueueEventJson[] = [];
  const frames: WsMessage[] = [];
  for (const tx of [...txs].reverse()) {
    let idx = 0;
    for (const ev of tx.events) {
      if (ev.data.mint.toBase58() !== mint) continue;
      const ts = new Date(tx.ms);
      const frame = eventFrame(ev, tx.signature, tx.slot, ts);
      frames.push(frame);
      if (ev.name === "Trade") {
        const t = ev.data;
        const price = t.tokenReserves > 0n ? q64ToSolPerToken(priceQ64(t.solReserves, t.tokenReserves)) : 0;
        const circ = t.supply >= t.poolTok + t.queued ? circulating(t.supply, t.poolTok, t.queued) : 0n;
        const active = t.phase === 1;
        const floor =
          active && circ > 0n
            ? q64ToSolPerToken(floorQ64(t.poolSol, circ))
            : t.tokensSold > 0n
              ? q64ToSolPerToken(floorQ64(t.realSol + t.floorReserve, t.tokensSold))
              : 0;
        rows.push({
          signature: tx.signature,
          event_index: idx++,
          user: t.isQueueFill ? "queue" : t.user.toBase58(),
          side: t.isBuy ? "buy" : "sell",
          phase: active ? "graduated" : "curve",
          is_queue_fill: t.isQueueFill,
          sol_amount: t.solAmount.toString(),
          sol_amount_display: solD(t.solAmount),
          token_amount: t.tokenAmount.toString(),
          token_amount_display: tokD(t.tokenAmount),
          fee_total: t.feeTotal.toString(),
          fee_total_display: solD(t.feeTotal),
          fee_to_floor: t.feeToFloor.toString(),
          fee_to_floor_display: solD(t.feeToFloor),
          queued_remainder: t.queuedRemainder.toString(),
          queued_remainder_display: tokD(t.queuedRemainder),
          price_after: price.toPrecision(12),
          price_after_display: price,
          floor_after: floor.toPrecision(12),
          floor_after_display: floor,
          slot: tx.slot,
          ts: ts.toISOString(),
          kind: "trade",
        });
        ticks.push({
          signature: tx.signature,
          slot: tx.slot,
          ms: tx.ms,
          kind: "trade",
          price,
          floor,
          active,
          poolSol: active ? t.poolSol : t.realSol,
          poolTok: active ? t.poolTok : t.tokenReserves,
          circ: active ? circ : t.tokensSold,
          volume: t.solAmount,
        });
      } else if (ev.name === "Redeemed") {
        const r = ev.data;
        const floor = r.circulatingAfter > 0n ? q64ToSolPerToken(floorQ64(r.poolSolAfter, r.circulatingAfter)) : 0;
        const price = r.poolTokAfter > 0n ? q64ToSolPerToken(priceQ64(r.poolSolAfter, r.poolTokAfter)) : 0;
        rows.push({
          signature: tx.signature,
          event_index: idx++,
          user: r.user.toBase58(),
          side: "sell",
          phase: "graduated",
          is_queue_fill: false,
          sol_amount: r.solOut.toString(),
          sol_amount_display: solD(r.solOut),
          token_amount: r.tokensBurned.toString(),
          token_amount_display: tokD(r.tokensBurned),
          fee_total: r.feeKept.toString(),
          fee_total_display: solD(r.feeKept),
          fee_to_floor: r.feeKept.toString(),
          fee_to_floor_display: solD(r.feeKept),
          queued_remainder: "0",
          queued_remainder_display: 0,
          price_after: price.toPrecision(12),
          price_after_display: price,
          floor_after: floor.toPrecision(12),
          floor_after_display: floor,
          slot: tx.slot,
          ts: ts.toISOString(),
          kind: "redeem",
        });
        ticks.push({
          signature: tx.signature,
          slot: tx.slot,
          ms: tx.ms,
          kind: "redeem",
          price,
          floor,
          active: true,
          poolSol: r.poolSolAfter,
          poolTok: r.poolTokAfter,
          circ: r.circulatingAfter,
          volume: 0n,
        });
      } else if (QUEUE_EVENTS.has(ev.name)) {
        const d = ev.data as unknown as Record<string, unknown>;
        const big = (k: string): bigint | null => (typeof d[k] === "bigint" ? (d[k] as bigint) : null);
        const amount = big("amount") ?? big("sold") ?? big("tokensReturned");
        const sol = big("solOut") ?? big("solPaid");
        const queuedTotal = big("queuedTotal") ?? big("queuedAfter");
        const user = (d.user ?? d.caller) as { toBase58(): string } | undefined;
        const windowStart = big("windowStart");
        queue.push({
          signature: tx.signature,
          event_index: idx++,
          kind: QUEUE_KIND[ev.name]!,
          user: user ? user.toBase58() : null,
          epoch: typeof d.epoch === "number" ? d.epoch : null,
          amount: amount?.toString() ?? null,
          amount_display: amount !== null ? tokD(amount) : null,
          queued_total: queuedTotal?.toString() ?? null,
          sol_amount: sol?.toString() ?? null,
          sol_amount_display: sol !== null ? solD(sol) : null,
          settle_kind: ev.name === "QueueSettled" && typeof d.kind === "number" ? d.kind : null,
          window_start: windowStart !== null ? Number(windowStart) : null,
          data: frame.data,
          slot: tx.slot,
          ts: ts.toISOString(),
        });
      }
    }
  }
  const out: Derived = { rows: rows.reverse(), ticks, queue: queue.reverse(), frames };
  derivedCache.set(txs, out);
  return out;
}
