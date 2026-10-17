"use client";
/**
 * Live event stream. One shared source per tab; components subscribe to a
 * mint (or "*") and get `{type, mint, data}` frames.
 * - indexer: its websocket (`/ws`), reconnecting with backoff;
 * - chain: polling `/api/events?after=<signature>` every few seconds (paused
 *   while the tab is hidden), the frames being the same shape;
 * - mock: an in-tab emitter driven by the mock dataset (a trade every few seconds).
 */
import { ENV, hasApi, wsUrl } from "@/lib/env";
import type { WsMessage } from "./types";

type Handler = (m: WsMessage) => void;

const handlers = new Map<string, Set<Handler>>();
let socket: WebSocket | null = null;
let retry = 0;
let mockStarted = false;
let pollStarted = false;

const POLL_MS = 5000;

function dispatch(m: WsMessage) {
  handlers.get(m.mint)?.forEach((h) => h(m));
  handlers.get("*")?.forEach((h) => h(m));
}

function sendSub(key: string) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ subscribe: key }));
}

function connectLive() {
  if (socket || typeof window === "undefined" || !hasApi) return;
  const url = wsUrl();
  if (!url) return;
  const ws = new WebSocket(url);
  socket = ws;
  ws.onopen = () => {
    retry = 0;
    for (const key of handlers.keys()) sendSub(key);
  };
  ws.onmessage = (ev) => {
    try {
      const m = JSON.parse(typeof ev.data === "string" ? ev.data : "") as WsMessage;
      if (m && typeof m.mint === "string" && m.data) dispatch(m);
    } catch {
      /* ignore */
    }
  };
  ws.onclose = () => {
    socket = null;
    if (handlers.size === 0) return;
    const delay = Math.min(15_000, 500 * 2 ** retry++);
    setTimeout(connectLive, delay);
  };
  ws.onerror = () => ws.close();
}

/** Chain mode: poll the program's newest transactions and replay them as frames. */
function startPolling() {
  if (pollStarted || typeof window === "undefined") return;
  pollStarted = true;
  let latest: string | null = null;
  let busy = false;
  const tick = async () => {
    if (busy || handlers.size === 0 || document.visibilityState === "hidden") return;
    busy = true;
    try {
      const res = await fetch(`/api/events${latest ? `?after=${latest}` : ""}`, { cache: "no-store", headers: { accept: "application/json" } });
      if (!res.ok) return;
      const page = (await res.json()) as { items: WsMessage[]; latest: string | null };
      if (latest !== null) for (const m of page.items) dispatch(m);
      if (page.latest) latest = page.latest;
    } catch {
      /* next tick */
    } finally {
      busy = false;
    }
  };
  void tick();
  setInterval(() => void tick(), POLL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void tick();
  });
}

async function startMock() {
  if (mockStarted || typeof window === "undefined") return;
  mockStarted = true;
  const [{ dataset }, ds] = await Promise.all([import("@/lib/mock/api"), import("@/lib/mock/dataset")]);
  const data = dataset();
  const loop = () => {
    const now = Date.now();
    const events = [...ds.crankAll(data, now), ...ds.keepBrakeDemoAlive(data, now)];
    data.lastAdvanceMs = now;
    emitEngineEvents(events);
  };
  setInterval(loop, 1000);
  const tradeLoop = () => {
    const now = Date.now();
    emitEngineEvents(ds.randomAction(data, now));
    data.lastAdvanceMs = now;
    setTimeout(tradeLoop, 2200 + Math.random() * 2600);
  };
  setTimeout(tradeLoop, 1800);
}

/** Broadcast mock engine events as websocket frames (mock feed and mock transactions). */
export function emitEngineEvents(events: { type: string; signature: string; slot: bigint; ms: number; data: Record<string, unknown> }[]) {
  for (const e of events) {
    dispatch({
      type: e.type as WsMessage["type"],
      mint: String(e.data.mint),
      signature: e.signature,
      slot: Number(e.slot),
      ts: new Date(e.ms).toISOString(),
      data: e.data,
    });
  }
}

/** Dispatch a frame produced locally (e.g. the events of a transaction this tab just confirmed). */
export function emitLocal(m: WsMessage) {
  dispatch(m);
}

export function subscribe(key: string, h: Handler): () => void {
  let set = handlers.get(key);
  const isNew = !set;
  if (!set) {
    set = new Set();
    handlers.set(key, set);
  }
  set.add(h);
  if (ENV.mock) void startMock();
  else if (ENV.chain) startPolling();
  else {
    connectLive();
    if (isNew) sendSub(key);
  }
  return () => {
    const s = handlers.get(key);
    if (!s) return;
    s.delete(h);
    if (s.size === 0) {
      handlers.delete(key);
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ unsubscribe: key }));
    }
  };
}
