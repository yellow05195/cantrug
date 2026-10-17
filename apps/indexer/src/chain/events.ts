/**
 * Anchor `emit!` events: each is a `Program data: <base64>` log line whose
 * payload is `sha256("event:<Name>")[0..8] ‖ borsh(fields)`.
 *
 * `extractProgramData` walks the invocation stack in the logs so that only
 * data logged while *our* program was executing is decoded: another program
 * printing a forged `Program data:` line with our discriminator is ignored.
 */
import { BorshReader, BorshWriter, type FieldType, type StructLayout } from "./borsh.js";
import { anchorDiscriminator, toHex } from "./discriminator.js";
import { EVENT_NAMES, EventLayouts, legacyLayout, type EventName } from "./layouts.js";
import type { FlooredEvent } from "./types.js";

const DISCRIMINATORS = new Map<string, EventName>(
  EVENT_NAMES.map((n) => [toHex(anchorDiscriminator("event", n)), n]),
);

export function eventDiscriminator(name: EventName): Uint8Array {
  return anchorDiscriminator("event", name);
}

export interface DecodedEvent {
  event: FlooredEvent;
  /**
   * Fields absent from the payload because it was emitted before the program
   * upgrade (see ADDED_IN_V2). They hold zero defaults (0 / 0n / false) here;
   * `completeLegacyEvent` (domain/legacy.ts) replaces them with derived values.
   */
  missing: string[];
}

/** Decode `body` with `layout`, requiring every byte to be consumed. */
function decodeExact(name: EventName, body: Uint8Array, layout: StructLayout): Record<string, unknown> {
  const r = new BorshReader(body);
  const data = r.struct(layout);
  // Trailing bytes mean the layout drifted from the program: refuse rather than mis-decode.
  if (r.remaining !== 0) throw new Error(`event ${name}: ${r.remaining} trailing bytes (layout mismatch?)`);
  return data;
}

function zeroOf(t: FieldType): unknown {
  if (t === "bool") return false;
  if (t === "u8" || t === "u16" || t === "u32") return 0;
  if (t === "u64" || t === "i64" || t === "u128") return 0n;
  throw new Error(`no default for field type ${JSON.stringify(t)}`);
}

/**
 * Decode one event payload (discriminator + borsh), strictly. If the payload
 * does not match the current layout, the pre-upgrade layout is tried (also
 * strictly); on success the fields it lacks are zero-filled and listed in
 * `missing`. Returns null for unknown discriminators; throws when neither
 * layout consumes the payload exactly.
 */
export function decodeEventDetailed(bytes: Uint8Array): DecodedEvent | null {
  if (bytes.length < 8) return null;
  const name = DISCRIMINATORS.get(toHex(bytes.subarray(0, 8)));
  if (!name) return null;
  const body = bytes.subarray(8);
  try {
    return { event: { name, data: decodeExact(name, body, EventLayouts[name]) } as unknown as FlooredEvent, missing: [] };
  } catch (err) {
    const legacy = legacyLayout(name);
    if (!legacy) throw err;
    let data: Record<string, unknown>;
    try {
      data = decodeExact(name, body, legacy);
    } catch {
      throw err; // report the current-layout error, it is the meaningful one
    }
    const missing: string[] = [];
    const full: Record<string, unknown> = {};
    for (const [field, type] of EventLayouts[name]) {
      if (field in data) full[field] = data[field];
      else {
        full[field] = zeroOf(type);
        missing.push(field);
      }
    }
    return { event: { name, data: full } as unknown as FlooredEvent, missing };
  }
}

export function decodeEventBytes(bytes: Uint8Array): FlooredEvent | null {
  return decodeEventDetailed(bytes)?.event ?? null;
}

export function decodeEventBase64(b64: string): FlooredEvent | null {
  return decodeEventBytes(new Uint8Array(Buffer.from(b64, "base64")));
}

/** Encode an event exactly as `emit!` does (used by tests and fixtures). */
export function encodeEvent(ev: FlooredEvent): Uint8Array {
  const w = new BorshWriter();
  w.raw(eventDiscriminator(ev.name));
  w.struct(EventLayouts[ev.name], ev.data as unknown as Record<string, unknown>);
  return w.toBytes();
}

export function encodeEventBase64(ev: FlooredEvent): string {
  return Buffer.from(encodeEvent(ev)).toString("base64");
}

export interface ProgramDataLog {
  /** Base64 payload. */
  data: string;
  /** Index of the top-level instruction that was executing (0-based). */
  ixIndex: number;
}

const INVOKE_RE = /^Program (\w+) invoke \[(\d+)\]$/;
const EXIT_RE = /^Program (\w+) (success|failed)/;
const DATA_PREFIX = "Program data: ";

/** Every `Program data:` payload logged while `programId` was the executing program. */
export function extractProgramData(logs: readonly string[], programId: string): ProgramDataLog[] {
  const stack: string[] = [];
  const out: ProgramDataLog[] = [];
  let ixIndex = -1;
  for (const line of logs) {
    const inv = INVOKE_RE.exec(line);
    if (inv) {
      if (inv[2] === "1") {
        ixIndex++;
        stack.length = 0;
      }
      stack.push(inv[1]!);
      continue;
    }
    if (EXIT_RE.test(line)) {
      stack.pop();
      continue;
    }
    if (line.startsWith(DATA_PREFIX) && stack.length > 0 && stack[stack.length - 1] === programId) {
      out.push({ data: line.slice(DATA_PREFIX.length).trim(), ixIndex: Math.max(ixIndex, 0) });
    }
  }
  return out;
}

export interface DecodedLogEvent {
  event: FlooredEvent;
  ixIndex: number;
  /** Ordinal of the event inside the transaction (0-based). */
  eventIndex: number;
  /** Pre-upgrade fields absent from the payload (empty for current-layout events). */
  missing: string[];
}

/** Decode every FLOORED event in a transaction's logs, in emission order. */
export function decodeEventsFromLogs(logs: readonly string[], programId: string): DecodedLogEvent[] {
  const out: DecodedLogEvent[] = [];
  for (const { data, ixIndex } of extractProgramData(logs, programId)) {
    let d: DecodedEvent | null = null;
    try {
      d = decodeEventDetailed(new Uint8Array(Buffer.from(data, "base64")));
    } catch {
      d = null; // malformed payload: skip rather than poison the whole transaction
    }
    if (d) out.push({ event: d.event, ixIndex, eventIndex: out.length, missing: d.missing });
  }
  return out;
}

export function isLogTruncated(logs: readonly string[]): boolean {
  return logs.some((l) => l === "Log truncated");
}
