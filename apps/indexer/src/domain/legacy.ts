/**
 * Completion of pre-upgrade events (devnet, before slot 512053014).
 *
 * The decoder zero-fills the fields an old payload lacks. Zero is right for
 * some of them (BrakeReleased.reason: the old program only released the brake
 * from window fills, i.e. reason 0) but would corrupt the projection for the
 * others, so they are rebuilt here the way the indexer derived them before the
 * upgrade, from the event itself and the coin row as it stands before it.
 */
import type { FlooredEvent } from "../chain/types.js";
import type { CoinRow } from "../db/schema.js";
import { TOTAL_SUPPLY } from "./math.js";
import { DEFAULT_PARAMS } from "./reducer.js";

export function completeLegacyEvent(ev: FlooredEvent, missing: readonly string[], prev: CoinRow | null, blockTime: number | null): FlooredEvent {
  if (missing.length === 0) return ev;
  const m = new Set(missing);
  // Old events without a timestamp get the transaction's block time.
  const timestamp = m.has("timestamp") ? (blockTime !== null ? BigInt(blockTime) : 0n) : undefined;
  // Always a copy: the decoded event is never mutated.
  const withTs = <T extends { timestamp: bigint }>(d: T): T => (timestamp === undefined ? { ...d } : { ...d, timestamp });

  switch (ev.name) {
    case "CoinCreated": {
      const d = withTs(ev.data);
      if (m.has("supply")) d.supply = TOTAL_SUPPLY; // minted once at creation
      return { name: ev.name, data: d };
    }
    case "Trade": {
      const d = withTs(ev.data);
      if (m.has("tokens_sold")) {
        // Curve: token_reserves = virtual_tok − tokens_sold. Pool: unchanged since graduation.
        const virtualTok = BigInt((prev?.params ?? DEFAULT_PARAMS).virtual_tok);
        d.tokens_sold = d.phase === 1 ? (prev?.tokens_sold ?? 0n) : virtualTok - d.token_reserves;
      }
      return { name: ev.name, data: d };
    }
    case "Redeemed": {
      const d = withTs(ev.data);
      if (m.has("queued")) {
        // circulating_after = supply_after − pool_tok_after − queued
        const q = d.supply_after - d.pool_tok_after - d.circulating_after;
        d.queued = q > 0n ? q : 0n;
      }
      return { name: ev.name, data: d };
    }
    case "QueueSettled": {
      const d = withTs(ev.data);
      if (m.has("queued_after")) {
        // Only a cancel changed the queue without a post-state event; a queue redeem
        // (kind 2) was preceded by a Redeemed that already carried the new size.
        const base = prev?.queued ?? 0n;
        const q = d.kind === 1 ? base - d.tokens_returned : base;
        d.queued_after = q > 0n ? q : 0n;
      }
      if (m.has("epoch")) d.epoch = prev?.brake_epoch ?? 0;
      return { name: ev.name, data: d };
    }
    case "BrakeReleased":
      // reason defaults to 0 (window fill), the only release the old program emitted.
      return { name: ev.name, data: withTs(ev.data) };
    case "BrakeEngaged":
      return { name: ev.name, data: withTs(ev.data) };
    case "QueueJoined":
      return { name: ev.name, data: withTs(ev.data) };
    case "QueueProcessed":
      return { name: ev.name, data: withTs(ev.data) };
    case "FeesClaimed":
      return { name: ev.name, data: withTs(ev.data) };
    case "Graduated":
      return { name: ev.name, data: withTs(ev.data) };
  }
}
