/**
 * Websocket fan-out. Each applied event is sent as `{type, mint, data}`.
 * Clients send `{"subscribe": "<mint>"}` (or `"*"`) to add a filter and
 * `{"unsubscribe": "<mint>"}` to remove it; with no subscription a client
 * receives everything.
 */
import { toJsonSafe } from "../domain/json.js";
import type { AppliedEvent } from "./handler.js";

export interface HubClient {
  send(data: string): void;
}

export interface WsMessage {
  type: string;
  mint: string;
  signature: string;
  slot: number;
  ts: string;
  data: unknown;
}

export class Hub {
  private clients = new Map<HubClient, Set<string>>();

  add(c: HubClient): void {
    this.clients.set(c, new Set());
  }
  remove(c: HubClient): void {
    this.clients.delete(c);
  }
  get size(): number {
    return this.clients.size;
  }

  /** Handle a client text frame. Returns a reply to send, if any. */
  onMessage(c: HubClient, raw: string): string | null {
    const subs = this.clients.get(c);
    if (!subs) return null;
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return JSON.stringify({ type: "error", error: "invalid json" });
    }
    if (msg && typeof msg === "object") {
      const m = msg as Record<string, unknown>;
      if (typeof m.subscribe === "string" && m.subscribe.length <= 64) {
        if (subs.size >= 100) return JSON.stringify({ type: "error", error: "too many subscriptions" });
        subs.add(m.subscribe);
        return JSON.stringify({ type: "subscribed", mint: m.subscribe });
      }
      if (typeof m.unsubscribe === "string") {
        subs.delete(m.unsubscribe);
        return JSON.stringify({ type: "unsubscribed", mint: m.unsubscribe });
      }
      if (m.ping !== undefined) return JSON.stringify({ type: "pong" });
    }
    return JSON.stringify({ type: "error", error: "expected {subscribe: mint} or {unsubscribe: mint}" });
  }

  static message(e: AppliedEvent): WsMessage {
    return { type: e.type, mint: e.mint, signature: e.signature, slot: e.slot, ts: e.ts.toISOString(), data: toJsonSafe(e.data) };
  }

  broadcast(events: readonly AppliedEvent[]): void {
    for (const e of events) {
      const payload = JSON.stringify(Hub.message(e));
      for (const [c, subs] of this.clients) {
        if (subs.size === 0 || subs.has("*") || subs.has(e.mint)) {
          try {
            c.send(payload);
          } catch {
            this.clients.delete(c);
          }
        }
      }
    }
  }
}
