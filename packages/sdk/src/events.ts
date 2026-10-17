/**
 * Anchor event decoding from transaction logs.
 *
 * `emit!` writes `Program data: <base64>` where the payload is
 * `sha256("event:<Name>")[0..8]` followed by the Borsh-encoded struct
 * (field order of `programs/floored/src/events.rs` / the IDL).
 */
import { Buffer } from "buffer";
import type { PublicKey } from "@solana/web3.js";
import { BorshReader, BorshWriter, eventDiscriminator } from "./borsh.js";
import { readCoinParams, writeCoinParams, type CoinParams } from "./accounts.js";
import { PROGRAM_ID } from "./pda.js";

// ─────────────────────────────── event types ───────────────────────────────

export interface CoinCreatedEvent {
  mint: PublicKey;
  coin: PublicKey;
  creator: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  params: CoinParams;
  /** Mint supply at creation (base units). */
  supply: bigint;
  slot: bigint;
  timestamp: bigint;
}

export interface TradeEvent {
  mint: PublicKey;
  user: PublicKey;
  isBuy: boolean;
  /** 0 = curve, 1 = pool. */
  phase: number;
  isQueueFill: boolean;
  /** SOL the user paid (buy, fee included) or received (sell, fee deducted). */
  solAmount: bigint;
  tokenAmount: bigint;
  feeTotal: bigint;
  /** Part of the fee that stays with the holders. */
  feeToFloor: bigint;
  /** Pricing reserves after the trade. */
  solReserves: bigint;
  tokenReserves: bigint;
  realSol: bigint;
  tokensSold: bigint;
  floorReserve: bigint;
  poolSol: bigint;
  poolTok: bigint;
  /** Tokens in the brake queue after the trade. For a user sell this includes `queuedRemainder` (Trade is emitted after QueueJoined). */
  queued: bigint;
  supply: bigint;
  /** Tokens of this order that went to the brake queue instead of executing. */
  queuedRemainder: bigint;
  slot: bigint;
  timestamp: bigint;
}

export interface GraduatedEvent {
  mint: PublicKey;
  caller: PublicKey;
  poolSol: bigint;
  poolTok: bigint;
  floorReserveAdded: bigint;
  tokensSold: bigint;
  supply: bigint;
  slot: bigint;
  timestamp: bigint;
}

export interface RedeemedEvent {
  mint: PublicKey;
  user: PublicKey;
  tokensBurned: bigint;
  poolTokensBurned: bigint;
  solOut: bigint;
  feeKept: bigint;
  poolSolAfter: bigint;
  poolTokAfter: bigint;
  supplyAfter: bigint;
  circulatingAfter: bigint;
  /** Tokens in the brake queue after the redemption. */
  queued: bigint;
  /** True when the tokens came from the sender's queue position. */
  fromQueue: boolean;
  slot: bigint;
  timestamp: bigint;
}

export interface BrakeEngagedEvent {
  mint: PublicKey;
  windowStart: bigint;
  refSol: bigint;
  refTok: bigint;
  queuedTotal: bigint;
  epoch: number;
  slot: bigint;
  timestamp: bigint;
}

/** `reason`: 0 = queue fully served by a window fill, 1 = last position cancelled or switched to the floor. */
export interface BrakeReleasedEvent {
  mint: PublicKey;
  epoch: number;
  reason: number;
  slot: bigint;
  timestamp: bigint;
}

export interface QueueJoinedEvent {
  mint: PublicKey;
  user: PublicKey;
  amount: bigint;
  queuedTotal: bigint;
  epoch: number;
  slot: bigint;
  timestamp: bigint;
}

export interface QueueProcessedEvent {
  mint: PublicKey;
  caller: PublicKey;
  epoch: number;
  windowStart: bigint;
  sold: bigint;
  solOut: bigint;
  queuedAfter: bigint;
  closedEpoch: boolean;
  crankReward: bigint;
  slot: bigint;
  timestamp: bigint;
}

/** `kind`: 0 = claim (keeps queuing), 1 = cancel, 2 = redeem at the floor. */
export interface QueueSettledEvent {
  mint: PublicKey;
  user: PublicKey;
  kind: number;
  tokensReturned: bigint;
  tokensRedeemed: bigint;
  solPaid: bigint;
  /** Queue size after this settlement (0 means the brake released). */
  queuedAfter: bigint;
  /** Epoch of the settled position. */
  epoch: number;
  slot: bigint;
  timestamp: bigint;
}

/** `kind`: 0 = creator, 1 = protocol. */
export interface FeesClaimedEvent {
  mint: PublicKey;
  kind: number;
  recipient: PublicKey;
  amount: bigint;
  slot: bigint;
  timestamp: bigint;
}

export interface EventDataMap {
  BrakeEngaged: BrakeEngagedEvent;
  BrakeReleased: BrakeReleasedEvent;
  CoinCreated: CoinCreatedEvent;
  FeesClaimed: FeesClaimedEvent;
  Graduated: GraduatedEvent;
  QueueJoined: QueueJoinedEvent;
  QueueProcessed: QueueProcessedEvent;
  QueueSettled: QueueSettledEvent;
  Redeemed: RedeemedEvent;
  Trade: TradeEvent;
}

export type EventName = keyof EventDataMap;

/** Discriminated union of every decoded event. */
export type FlooredEvent = { [K in EventName]: { name: K; data: EventDataMap[K] } }[EventName];

// ─────────────────────────────── schemas ───────────────────────────────

/** Borsh field types used by FLOORED events (IDL type names). */
export type FieldType = "pubkey" | "u8" | "u32" | "u64" | "i64" | "bool" | "string" | "CoinParams";

/** Field order and types, matching the IDL `types` entries (snake_case in the IDL, camelCase here). */
export const EVENT_SCHEMAS: { readonly [K in EventName]: readonly (readonly [keyof EventDataMap[K] & string, FieldType])[] } = {
  BrakeEngaged: [
    ["mint", "pubkey"],
    ["windowStart", "u64"],
    ["refSol", "u64"],
    ["refTok", "u64"],
    ["queuedTotal", "u64"],
    ["epoch", "u32"],
    ["slot", "u64"],
    ["timestamp", "i64"],
  ],
  BrakeReleased: [
    ["mint", "pubkey"],
    ["epoch", "u32"],
    ["reason", "u8"],
    ["slot", "u64"],
    ["timestamp", "i64"],
  ],
  CoinCreated: [
    ["mint", "pubkey"],
    ["coin", "pubkey"],
    ["creator", "pubkey"],
    ["name", "string"],
    ["symbol", "string"],
    ["uri", "string"],
    ["params", "CoinParams"],
    ["supply", "u64"],
    ["slot", "u64"],
    ["timestamp", "i64"],
  ],
  FeesClaimed: [
    ["mint", "pubkey"],
    ["kind", "u8"],
    ["recipient", "pubkey"],
    ["amount", "u64"],
    ["slot", "u64"],
    ["timestamp", "i64"],
  ],
  Graduated: [
    ["mint", "pubkey"],
    ["caller", "pubkey"],
    ["poolSol", "u64"],
    ["poolTok", "u64"],
    ["floorReserveAdded", "u64"],
    ["tokensSold", "u64"],
    ["supply", "u64"],
    ["slot", "u64"],
    ["timestamp", "i64"],
  ],
  QueueJoined: [
    ["mint", "pubkey"],
    ["user", "pubkey"],
    ["amount", "u64"],
    ["queuedTotal", "u64"],
    ["epoch", "u32"],
    ["slot", "u64"],
    ["timestamp", "i64"],
  ],
  QueueProcessed: [
    ["mint", "pubkey"],
    ["caller", "pubkey"],
    ["epoch", "u32"],
    ["windowStart", "u64"],
    ["sold", "u64"],
    ["solOut", "u64"],
    ["queuedAfter", "u64"],
    ["closedEpoch", "bool"],
    ["crankReward", "u64"],
    ["slot", "u64"],
    ["timestamp", "i64"],
  ],
  QueueSettled: [
    ["mint", "pubkey"],
    ["user", "pubkey"],
    ["kind", "u8"],
    ["tokensReturned", "u64"],
    ["tokensRedeemed", "u64"],
    ["solPaid", "u64"],
    ["queuedAfter", "u64"],
    ["epoch", "u32"],
    ["slot", "u64"],
    ["timestamp", "i64"],
  ],
  Redeemed: [
    ["mint", "pubkey"],
    ["user", "pubkey"],
    ["tokensBurned", "u64"],
    ["poolTokensBurned", "u64"],
    ["solOut", "u64"],
    ["feeKept", "u64"],
    ["poolSolAfter", "u64"],
    ["poolTokAfter", "u64"],
    ["supplyAfter", "u64"],
    ["circulatingAfter", "u64"],
    ["queued", "u64"],
    ["fromQueue", "bool"],
    ["slot", "u64"],
    ["timestamp", "i64"],
  ],
  Trade: [
    ["mint", "pubkey"],
    ["user", "pubkey"],
    ["isBuy", "bool"],
    ["phase", "u8"],
    ["isQueueFill", "bool"],
    ["solAmount", "u64"],
    ["tokenAmount", "u64"],
    ["feeTotal", "u64"],
    ["feeToFloor", "u64"],
    ["solReserves", "u64"],
    ["tokenReserves", "u64"],
    ["realSol", "u64"],
    ["tokensSold", "u64"],
    ["floorReserve", "u64"],
    ["poolSol", "u64"],
    ["poolTok", "u64"],
    ["queued", "u64"],
    ["supply", "u64"],
    ["queuedRemainder", "u64"],
    ["slot", "u64"],
    ["timestamp", "i64"],
  ],
};

export const EVENT_NAMES = Object.keys(EVENT_SCHEMAS) as EventName[];

/** `sha256("event:<Name>")[0..8]` for every event. */
export const EVENT_DISCRIMINATORS: Readonly<Record<EventName, Uint8Array>> = Object.freeze(
  Object.fromEntries(EVENT_NAMES.map((n) => [n, eventDiscriminator(n)])) as unknown as Record<EventName, Uint8Array>,
);

const byDisc = new Map<string, EventName>(EVENT_NAMES.map((n) => [Buffer.from(EVENT_DISCRIMINATORS[n]).toString("hex"), n]));

function readField(r: BorshReader, t: FieldType): unknown {
  switch (t) {
    case "pubkey":
      return r.pubkey();
    case "u8":
      return r.u8();
    case "u32":
      return r.u32();
    case "u64":
      return r.u64();
    case "i64":
      return r.i64();
    case "bool":
      return r.bool();
    case "string":
      return r.string();
    case "CoinParams":
      return readCoinParams(r);
  }
}

function writeField(w: BorshWriter, t: FieldType, v: unknown): void {
  switch (t) {
    case "pubkey":
      w.pubkey(v as PublicKey);
      return;
    case "u8":
      w.u8(v as number);
      return;
    case "u32":
      w.u32(v as number);
      return;
    case "u64":
      w.u64(v as bigint);
      return;
    case "i64":
      w.i64(v as bigint);
      return;
    case "bool":
      w.bool(v as boolean);
      return;
    case "string":
      w.string(v as string);
      return;
    case "CoinParams":
      writeCoinParams(w, v as CoinParams);
      return;
  }
}

/** Decode one event payload (discriminator + Borsh). Returns null for unknown discriminators. */
export function decodeEvent(payload: Uint8Array): FlooredEvent | null {
  if (payload.length < 8) return null;
  const name = byDisc.get(Buffer.from(payload.subarray(0, 8)).toString("hex"));
  if (!name) return null;
  const r = new BorshReader(payload, 8);
  const data: Record<string, unknown> = {};
  for (const [field, type] of EVENT_SCHEMAS[name]) data[field] = readField(r, type);
  return { name, data } as unknown as FlooredEvent;
}

/** Encode an event the way `emit!` does (discriminator + Borsh). Useful for tests and indexer fixtures. */
export function encodeEvent<K extends EventName>(name: K, data: EventDataMap[K]): Buffer {
  const w = new BorshWriter().raw(EVENT_DISCRIMINATORS[name]);
  const rec = data as unknown as Record<string, unknown>;
  for (const [field, type] of EVENT_SCHEMAS[name]) writeField(w, type, rec[field]);
  return w.toBuffer();
}

const DATA_PREFIX = "Program data: ";
const INVOKE_RE = /^Program (\w+) invoke \[\d+\]$/;
const EXIT_RE = /^Program (\w+) (success|failed)/;

export interface ParseEventsOptions {
  /** Only decode `Program data:` lines emitted while this program is executing. Default `PROGRAM_ID`. Pass null to accept any. */
  programId?: PublicKey | null;
}

/**
 * Decode every FLOORED event in a transaction's log messages, in order.
 * Tracks the invoke stack so that `Program data:` lines from other programs
 * (CPIs, other instructions) are ignored; unknown payloads are skipped.
 */
export function parseEvents(logs: readonly string[] | null | undefined, opts: ParseEventsOptions = {}): FlooredEvent[] {
  if (!logs) return [];
  const want = opts.programId === undefined ? PROGRAM_ID.toBase58() : opts.programId?.toBase58() ?? null;
  const stack: string[] = [];
  const out: FlooredEvent[] = [];
  for (const line of logs) {
    const inv = INVOKE_RE.exec(line);
    if (inv) {
      stack.push(inv[1]!);
      continue;
    }
    const ex = EXIT_RE.exec(line);
    if (ex) {
      stack.pop();
      continue;
    }
    if (!line.startsWith(DATA_PREFIX)) continue;
    if (want !== null && stack[stack.length - 1] !== want) continue;
    let bytes: Buffer;
    try {
      bytes = Buffer.from(line.slice(DATA_PREFIX.length).trim(), "base64");
    } catch {
      continue;
    }
    try {
      const ev = decodeEvent(bytes);
      if (ev) out.push(ev);
    } catch {
      // Malformed payload with a matching discriminator: skip rather than fail the whole tx.
    }
  }
  return out;
}

/** Narrow `parseEvents` output to one event type. */
export function eventsOf<K extends EventName>(events: readonly FlooredEvent[], name: K): EventDataMap[K][] {
  return events.filter((e) => e.name === name).map((e) => e.data as EventDataMap[K]);
}
