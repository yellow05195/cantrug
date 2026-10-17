/**
 * Program event parsing with a fallback for the pre-upgrade event layout.
 *
 * `@floored/sdk`'s `parseEvents` decodes the current (v2) layouts. The program
 * deployed on devnet still emits the v1 layouts (v2 appended a few fields, e.g.
 * `Trade.tokensSold`), which the SDK rejects as truncated. This parser tries the
 * SDK decoder first and, when a payload is too short, decodes it with the SDK's
 * own schema minus the v2 fields (same list as the indexer's `ADDED_IN_V2`).
 */
import {
  BorshReader,
  EVENT_DISCRIMINATORS,
  EVENT_NAMES,
  EVENT_SCHEMAS,
  PROGRAM_ID,
  decodeEvent,
  readCoinParams,
  type EventName,
  type FieldType,
  type FlooredEvent,
} from "@floored/sdk";
import { Buffer } from "buffer";

const ADDED_IN_V2: Partial<Record<EventName, string[]>> = {
  Trade: ["tokensSold"],
  Redeemed: ["queued"],
  BrakeEngaged: ["timestamp"],
  BrakeReleased: ["reason", "timestamp"],
  QueueJoined: ["timestamp"],
  QueueProcessed: ["timestamp"],
  QueueSettled: ["queuedAfter", "epoch", "timestamp"],
  FeesClaimed: ["timestamp"],
};

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

function zero(t: FieldType): unknown {
  return t === "u64" || t === "i64" ? 0n : t === "bool" ? false : t === "string" ? "" : 0;
}

function decodeLegacy(payload: Uint8Array): FlooredEvent | null {
  if (payload.length < 8) return null;
  const name = byDisc.get(Buffer.from(payload.subarray(0, 8)).toString("hex"));
  if (!name) return null;
  const added = new Set(ADDED_IN_V2[name] ?? []);
  if (!added.size) return null;
  const r = new BorshReader(payload, 8);
  const data: Record<string, unknown> = {};
  for (const [field, type] of EVENT_SCHEMAS[name]) data[field] = added.has(field) ? zero(type) : readField(r, type);
  return { name, data } as unknown as FlooredEvent;
}

const DATA_PREFIX = "Program data: ";
const INVOKE_RE = /^Program (\w+) invoke \[\d+\]$/;
const EXIT_RE = /^Program (\w+) (success|failed)/;

/** Like the SDK's `parseEvents`, plus v1 payloads. */
export function parseFlooredEvents(logs: readonly string[] | null | undefined): FlooredEvent[] {
  if (!logs) return [];
  const want = PROGRAM_ID.toBase58();
  const stack: string[] = [];
  const out: FlooredEvent[] = [];
  for (const line of logs) {
    const inv = INVOKE_RE.exec(line);
    if (inv) {
      stack.push(inv[1]!);
      continue;
    }
    if (EXIT_RE.test(line)) {
      stack.pop();
      continue;
    }
    if (!line.startsWith(DATA_PREFIX) || stack[stack.length - 1] !== want) continue;
    const bytes = Buffer.from(line.slice(DATA_PREFIX.length).trim(), "base64");
    let ev: FlooredEvent | null = null;
    try {
      ev = decodeEvent(bytes);
    } catch {
      try {
        ev = decodeLegacy(bytes);
      } catch {
        ev = null;
      }
    }
    if (ev) out.push(ev);
  }
  return out;
}
