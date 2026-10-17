/**
 * Program events → the indexer's wire format: snake_case keys, bigint as
 * decimal strings, pubkeys as base58 (apps/indexer/src/domain/json.ts).
 */
import type { FlooredEvent } from "@floored/sdk";
import type { WsMessage } from "@/lib/api/types";

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());

export function toWire(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (v && typeof v === "object") {
    if (typeof (v as { toBase58?: unknown }).toBase58 === "function") return (v as { toBase58(): string }).toBase58();
    if (v instanceof Uint8Array) return Buffer.from(v).toString("base64");
    if (Array.isArray(v)) return v.map(toWire);
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[snake(k)] = toWire(x);
    return out;
  }
  return v;
}

export function eventFrame(ev: FlooredEvent, signature: string, slot: number, ts: Date): WsMessage {
  return {
    type: ev.name,
    mint: ev.data.mint.toBase58(),
    signature,
    slot,
    ts: ts.toISOString(),
    data: toWire(ev.data) as Record<string, unknown>,
  };
}

export const solD = (v: bigint) => Number(v) / 1e9;
export const tokD = (v: bigint) => Number(v) / 1e6;
