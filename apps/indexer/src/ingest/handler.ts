/**
 * Apply one transaction: decode FLOORED events from its logs and write every
 * effect in a single DB transaction, keyed by signature for idempotency.
 * Shared by the Helius webhook and the backfill CLI.
 */
import { decodeEventsFromLogs, isLogTruncated } from "../chain/events.js";
import type { EventName } from "../chain/layouts.js";
import type { FlooredEvent } from "../chain/types.js";
import type { CoinRow, QueueEventRow } from "../db/schema.js";
import { applyTick, bucketStart, CANDLE_INTERVALS } from "../domain/candles.js";
import { completeLegacyEvent } from "../domain/legacy.js";
import { toJsonSafe } from "../domain/json.js";
import { reduceCoin } from "../domain/reducer.js";
import { snapshotFromCoin, tradePriceFloor } from "../domain/snapshot.js";
import type { IngestStore, IngestTx } from "../repo/types.js";

/** Normalized transaction, whatever the source (Helius raw webhook, RPC). */
export interface RawTransaction {
  signature: string;
  slot: number;
  /** Unix seconds. */
  blockTime: number | null;
  /** `meta.err`: non-null means the transaction failed and its logs must be ignored. */
  err: unknown;
  logs: string[];
}

export interface AppliedEvent {
  type: EventName;
  mint: string;
  signature: string;
  slot: number;
  eventIndex: number;
  ts: Date;
  data: FlooredEvent["data"];
}

export type ProcessStatus = "applied" | "duplicate" | "failed_tx" | "no_events";

export interface ProcessResult {
  signature: string;
  status: ProcessStatus;
  events: AppliedEvent[];
  /** The runtime truncated the logs: events may be missing (backfill from account state). */
  truncated: boolean;
  /** Pre-upgrade fields that were absent and filled in (empty for current-layout transactions). */
  legacyFields: string[];
}

/** Every event carries the on-chain clock; blockTime is only a fallback for a zero timestamp. */
function eventTime(ev: FlooredEvent, blockTime: number | null, fallback: Date): Date {
  if (ev.data.timestamp > 0n) return new Date(Number(ev.data.timestamp) * 1000);
  if (blockTime !== null) return new Date(blockTime * 1000);
  return fallback;
}

function queueRow(ev: FlooredEvent, base: Pick<QueueEventRow, "signature" | "event_index" | "slot" | "ts">): QueueEventRow | null {
  const common = { ...base, mint: ev.data.mint, data: toJsonSafe(ev.data) as Record<string, unknown> };
  switch (ev.name) {
    case "QueueJoined":
      return { ...common, kind: "joined", user: ev.data.user, epoch: ev.data.epoch, amount: ev.data.amount, queued_total: ev.data.queued_total, sol_amount: null, settle_kind: null, window_start: null };
    case "QueueProcessed":
      return { ...common, kind: "processed", user: ev.data.caller, epoch: ev.data.epoch, amount: ev.data.sold, queued_total: ev.data.queued_after, sol_amount: ev.data.sol_out, settle_kind: null, window_start: Number(ev.data.window_start) };
    case "QueueSettled":
      return {
        ...common,
        kind: "settled",
        user: ev.data.user,
        epoch: ev.data.epoch,
        amount: ev.data.kind === 2 ? ev.data.tokens_redeemed : ev.data.tokens_returned,
        queued_total: ev.data.queued_after,
        sol_amount: ev.data.sol_paid,
        settle_kind: ev.data.kind,
        window_start: null,
      };
    case "BrakeEngaged":
      return { ...common, kind: "engaged", user: null, epoch: ev.data.epoch, amount: null, queued_total: ev.data.queued_total, sol_amount: null, settle_kind: null, window_start: Number(ev.data.window_start) };
    case "BrakeReleased":
      return { ...common, kind: "released", user: null, epoch: ev.data.epoch, amount: null, queued_total: 0n, sol_amount: null, settle_kind: null, window_start: null };
    default:
      return null;
  }
}

async function applyEvent(
  tx: IngestTx,
  coins: Map<string, CoinRow | null>,
  ev: FlooredEvent,
  meta: { signature: string; eventIndex: number; ixIndex: number; slot: number; ts: Date; missing: string[] },
): Promise<void> {
  const mint = ev.data.mint;
  if (!coins.has(mint)) coins.set(mint, await tx.getCoinForUpdate(mint));
  const prev = coins.get(mint) ?? null;
  const next = reduceCoin(prev, ev, { ts: meta.ts });
  coins.set(mint, next);
  const slot = Number(ev.data.slot);

  switch (ev.name) {
    case "Trade": {
      const e = ev.data;
      const { price, floor } = tradePriceFloor(e);
      await tx.insertTrade({
        signature: meta.signature,
        event_index: meta.eventIndex,
        ix_index: meta.ixIndex,
        mint,
        user: e.user,
        side: e.is_buy ? "buy" : "sell",
        phase: e.phase === 1 ? "graduated" : "curve",
        is_queue_fill: e.is_queue_fill,
        sol_amount: e.sol_amount,
        token_amount: e.token_amount,
        fee_total: e.fee_total,
        fee_to_floor: e.fee_to_floor,
        price_after: price,
        floor_after: floor,
        queued_remainder: e.queued_remainder,
        slot,
        ts: meta.ts,
      });
      for (const interval of CANDLE_INTERVALS) {
        const prevCandle = await tx.getCandleForUpdate(mint, interval, bucketStart(meta.ts, interval));
        await tx.saveCandle(applyTick(prevCandle, { mint, ts: meta.ts, slot, price, floor, volume: e.sol_amount }, interval));
      }
      break;
    }
    case "Redeemed": {
      const e = ev.data;
      await tx.insertRedeem({
        signature: meta.signature,
        event_index: meta.eventIndex,
        mint,
        user: e.user,
        tokens_burned: e.tokens_burned,
        pool_tokens_burned: e.pool_tokens_burned,
        sol_out: e.sol_out,
        fee_kept: e.fee_kept,
        from_queue: e.from_queue,
        slot,
        ts: meta.ts,
      });
      await tx.saveFloorSnapshot(snapshotFromCoin(next, meta.ts));
      break;
    }
    case "Graduated":
      await tx.saveFloorSnapshot(snapshotFromCoin(next, meta.ts));
      break;
    default: {
      const row = queueRow(ev, { signature: meta.signature, event_index: meta.eventIndex, slot, ts: meta.ts });
      // Keep a trace of which fields were rebuilt for pre-upgrade events.
      if (row && meta.missing.length) row.data = { ...row.data, legacy_missing: meta.missing };
      if (row) await tx.insertQueueEvent(row);
    }
  }
}

export async function processTransaction(store: IngestStore, raw: RawTransaction, programId: string, now = new Date()): Promise<ProcessResult> {
  const truncated = isLogTruncated(raw.logs);
  return store.transaction(async (tx) => {
    if (await tx.isProcessed(raw.signature)) {
      return { signature: raw.signature, status: "duplicate" as const, events: [], truncated, legacyFields: [] };
    }
    if (raw.err !== null && raw.err !== undefined) {
      await tx.markProcessed(raw.signature, raw.slot);
      return { signature: raw.signature, status: "failed_tx" as const, events: [], truncated, legacyFields: [] };
    }
    const decoded = decodeEventsFromLogs(raw.logs, programId);
    const coins = new Map<string, CoinRow | null>();
    const applied: AppliedEvent[] = [];
    const legacyFields = new Set<string>();
    for (const d of decoded) {
      const mint = d.event.data.mint;
      if (!coins.has(mint)) coins.set(mint, await tx.getCoinForUpdate(mint));
      // Pre-upgrade payloads: rebuild the absent fields from the event and the row before it.
      const ev = completeLegacyEvent(d.event, d.missing, coins.get(mint) ?? null, raw.blockTime);
      for (const f of d.missing) legacyFields.add(`${ev.name}.${f}`);
      const ts = eventTime(ev, raw.blockTime, now);
      await applyEvent(tx, coins, ev, { signature: raw.signature, eventIndex: d.eventIndex, ixIndex: d.ixIndex, slot: raw.slot, ts, missing: d.missing });
      applied.push({ type: ev.name, mint, signature: raw.signature, slot: Number(ev.data.slot), eventIndex: d.eventIndex, ts, data: ev.data });
    }
    for (const row of coins.values()) if (row) await tx.saveCoin(row);
    await tx.markProcessed(raw.signature, raw.slot);
    return {
      signature: raw.signature,
      status: applied.length ? ("applied" as const) : ("no_events" as const),
      events: applied,
      truncated,
      legacyFields: [...legacyFields],
    };
  });
}
