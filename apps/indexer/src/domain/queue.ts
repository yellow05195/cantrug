/**
 * Brake queue helpers: window ETA and a best-effort per-wallet view rebuilt
 * from queue events (the exact live remainder of a position needs the
 * on-chain QueueEntry `shares · scale`; events only allow a pro-rata estimate).
 */
import type { CoinRow, QueueEventKind } from "../db/schema.js";
import { effectiveParams } from "./reducer.js";
import { windowStart } from "./math.js";

export interface BrakeEta {
  window_slots: number;
  /** Slot estimated from the last indexed event plus wall-clock drift. */
  est_current_slot: number;
  current_window_start: number;
  next_window_start: number;
  slots_remaining: number;
  eta_seconds: number;
  eta_ts: string;
}

export function brakeEta(
  row: Pick<CoinRow, "params" | "brake_window_start" | "created_slot" | "last_event_slot" | "last_event_ts">,
  now: Date,
  slotMs: number,
): BrakeEta | null {
  const anchor = row.brake_window_start ?? row.created_slot;
  if (anchor === null || row.last_event_slot === 0) return null;
  const len = BigInt(effectiveParams(row).brake_window_slots);
  if (len === 0n) return null;
  const drift = row.last_event_ts ? Math.max(0, Math.floor((now.getTime() - row.last_event_ts.getTime()) / slotMs)) : 0;
  const est = BigInt(row.last_event_slot + drift);
  const cur = windowStart(BigInt(anchor), len, est);
  const next = cur + len;
  const remaining = Number(next - est);
  const etaSeconds = (remaining * slotMs) / 1000;
  return {
    window_slots: Number(len),
    est_current_slot: Number(est),
    current_window_start: Number(cur),
    next_window_start: Number(next),
    slots_remaining: remaining,
    eta_seconds: etaSeconds,
    eta_ts: new Date(now.getTime() + etaSeconds * 1000).toISOString(),
  };
}

export interface QueueEventLike {
  kind: QueueEventKind;
  user: string | null;
  amount: bigint | null;
  queued_total: bigint | null;
  settle_kind: number | null;
  data: Record<string, unknown>;
  slot: number;
}

export interface WalletQueueEstimate {
  user: string;
  /** Estimated tokens still queued (pro rata of the aggregate fills). */
  queued_estimate: bigint;
  /** Tokens this wallet put in the queue in the current episode. */
  joined_total: bigint;
  last_slot: number;
}

/** Replay queue events (oldest first) into per-wallet estimates; wallets at zero are dropped. */
export function replayQueue(events: readonly QueueEventLike[]): WalletQueueEstimate[] {
  const m = new Map<string, WalletQueueEstimate>();
  for (const e of events) {
    switch (e.kind) {
      case "joined": {
        if (!e.user || e.amount === null) break;
        const w = m.get(e.user) ?? { user: e.user, queued_estimate: 0n, joined_total: 0n, last_slot: e.slot };
        w.queued_estimate += e.amount;
        w.joined_total += e.amount;
        w.last_slot = e.slot;
        m.set(e.user, w);
        break;
      }
      case "processed": {
        const sold = e.amount ?? 0n;
        const after = e.queued_total ?? 0n;
        const before = after + sold;
        if (e.data["closed_epoch"] === true || after === 0n || before === 0n) {
          m.clear();
          break;
        }
        for (const w of m.values()) w.queued_estimate = (w.queued_estimate * after) / before;
        break;
      }
      case "settled": {
        if (!e.user) break;
        if (e.settle_kind === 1 || e.settle_kind === 2) m.delete(e.user);
        break;
      }
      case "released":
        m.clear();
        break;
      case "engaged":
        break;
    }
  }
  return [...m.values()].filter((w) => w.queued_estimate > 0n).sort((a, b) => (b.queued_estimate > a.queued_estimate ? 1 : -1));
}
