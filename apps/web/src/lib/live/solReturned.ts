"use client";
import { useEffect, useSyncExternalStore } from "react";
import { subscribe } from "@/lib/api/ws";
import type { WsRedeemed } from "@/lib/api/types";

/**
 * "SOL returned to holders": the platform total from /api/stats, then every
 * Redeemed event on the websocket adds its sol_out. Shared by the header
 * mini-counter and the home hero so they always agree.
 */
let total: bigint | null = null;
let launched = 0;
let brakes = 0;
const listeners = new Set<() => void>();
let wired = false;

function wire() {
  if (wired) return;
  wired = true;
  subscribe("*", (m) => {
    if (m.type === "Redeemed" && total !== null) {
      const d = m.data as unknown as WsRedeemed;
      try {
        total += BigInt(d.sol_out);
        listeners.forEach((l) => l());
      } catch {
        /* malformed */
      }
    } else if (m.type === "BrakeEngaged") {
      brakes += 1;
      listeners.forEach((l) => l());
    } else if (m.type === "CoinCreated") {
      launched += 1;
      listeners.forEach((l) => l());
    }
  });
}

export function seedStats(s: { lamports: bigint; launched: number; brakes: number }) {
  if (total === null || s.lamports > total) total = s.lamports;
  if (s.launched > launched) launched = s.launched;
  if (s.brakes > brakes) brakes = s.brakes;
}

let snap = { total: 0n as bigint | null, launched: 0, brakes: 0 };
function snapshot() {
  if (snap.total !== total || snap.launched !== launched || snap.brakes !== brakes) snap = { total, launched, brakes };
  return snap;
}

const serverCache = new Map<string, { total: bigint | null; launched: number; brakes: number }>();
function serverSnapshot(seed: { lamports: bigint; launched: number; brakes: number } | null) {
  const key = seed ? `${seed.lamports}:${seed.launched}:${seed.brakes}` : "none";
  let v = serverCache.get(key);
  if (!v) {
    v = seed ? { total: seed.lamports, launched: seed.launched, brakes: seed.brakes } : { total: null, launched: 0, brakes: 0 };
    if (serverCache.size > 50) serverCache.clear();
    serverCache.set(key, v);
  }
  return v;
}

export function useLiveStats(seed: { lamports: bigint; launched: number; brakes: number } | null) {
  // Module state lives in the browser only; the server always renders the request's own seed.
  if (seed && typeof window !== "undefined") seedStats(seed);
  useEffect(() => {
    wire();
  }, []);
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    snapshot,
    () => serverSnapshot(seed),
  );
  return s;
}
