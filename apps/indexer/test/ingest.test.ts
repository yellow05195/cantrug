import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { encodeEventBase64 } from "../src/chain/events.js";
import { processTransaction } from "../src/ingest/handler.js";
import { verifyWebhookAuth } from "../src/ingest/helius.js";
import { Hub } from "../src/ingest/hub.js";
import { Ingestor } from "../src/ingest/ingestor.js";
import { MemoryStore } from "../src/repo/memory.js";
import type { ReadStore } from "../src/repo/types.js";
import {
  ALICE,
  BOB,
  coinCreated,
  curveTrade,
  graduated,
  heliusTx,
  key,
  MINT,
  poolTrade,
  PROGRAM_ID,
  rawTx,
  redeemed,
  queueJoined,
  brakeEngaged,
  T0,
} from "./fixtures.js";

const SECRET = "s3cret-webhook-token";

function setup() {
  const store = new MemoryStore();
  const ingestor = new Ingestor(store, PROGRAM_ID);
  const hub = new Hub();
  ingestor.onApplied((e) => hub.broadcast(e));
  const read = { ping: async () => true } as unknown as ReadStore;
  const app = createApp({ ingestor, read, hub, webhookSecret: SECRET, slotMs: 400 });
  return { store, ingestor, hub, app };
}

const post = (app: ReturnType<typeof setup>["app"], body: unknown, auth?: string) =>
  app.request("/webhooks/helius", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth !== undefined ? { authorization: auth } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("webhook auth", () => {
  it("rejects a missing or wrong Authorization header", async () => {
    const { app, store } = setup();
    const body = [heliusTx(rawTx([coinCreated()]))];
    expect((await post(app, body)).status).toBe(401);
    expect((await post(app, body, "nope")).status).toBe(401);
    expect((await post(app, body, `${SECRET}x`)).status).toBe(401);
    expect((await post(app, body, "")).status).toBe(401);
    expect(store.coin(MINT)).toBeUndefined();
  });

  it("refuses everything when no secret is configured", () => {
    expect(verifyWebhookAuth("", "")).toBe(false);
    expect(verifyWebhookAuth("anything", "")).toBe(false);
    expect(verifyWebhookAuth(SECRET, SECRET)).toBe(true);
    expect(verifyWebhookAuth(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("rejects malformed payloads with 400", async () => {
    const { app } = setup();
    expect((await post(app, "{not json", SECRET)).status).toBe(400);
    expect((await post(app, [{ foo: 1 }], SECRET)).status).toBe(400);
  });
});

describe("webhook ingestion", () => {
  it("applies Helius raw transactions idempotently and broadcasts", async () => {
    const { app, store, hub } = setup();
    const got: string[] = [];
    const filtered: string[] = [];
    const all = { send: (d: string) => got.push(d) };
    const other = { send: (d: string) => filtered.push(d) };
    hub.add(all);
    hub.add(other);
    hub.onMessage(other, JSON.stringify({ subscribe: key() }));

    const txs = [rawTx([coinCreated()]), rawTx([curveTrade()])];
    const res = await post(app, txs.map(heliusTx), SECRET);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: 2, applied: 2, events: 2 });
    expect(store.coin(MINT)?.buy_count).toBe(1);
    expect(got.map((g) => JSON.parse(g).type)).toEqual(["CoinCreated", "Trade"]);
    const msg = JSON.parse(got[1]!);
    expect(msg).toMatchObject({ type: "Trade", mint: MINT, data: { sol_amount: "10000000", is_buy: true } });
    expect(filtered).toEqual([]);

    // Replay: nothing applied twice.
    const again = await post(app, txs.map(heliusTx), SECRET);
    expect(await again.json()).toMatchObject({ applied: 0, duplicates: 2 });
    expect(store.coin(MINT)?.buy_count).toBe(1);
    expect(store.trades()).toHaveLength(1);
    expect(got).toHaveLength(2);
  });

  it("ignores failed transactions", async () => {
    const { app, store } = setup();
    const tx = rawTx([coinCreated()], { err: { InstructionError: [1, { Custom: 6001 }] } });
    const res = await post(app, [heliusTx(tx)], SECRET);
    expect(await res.json()).toMatchObject({ failed_txs: 1, applied: 0 });
    expect(store.coin(MINT)).toBeUndefined();
  });
});

describe("processTransaction", () => {
  it("writes trades, candles, snapshots and queue events in one go", async () => {
    const store = new MemoryStore();
    const seq = [
      rawTx([coinCreated()]),
      rawTx([curveTrade()]),
      rawTx([curveTrade({ slot: 1002n, timestamp: T0 + 30n, user: BOB, real_sol: 20_000_000n, token_reserves: 1_072_300_000_000_000n, sol_amount: 10_200_000n })]),
      rawTx([graduated()]),
      rawTx([poolTrade()]),
      // One sell instruction, in program order: queue fill of the previous window, queue join,
      // brake engaged, then the user's trade (whose `queued` already includes the remainder).
      rawTx([
        poolTrade({ is_buy: false, is_queue_fill: true, user: key(), slot: 2200n, timestamp: T0 + 800n }),
        queueJoined({ user: ALICE, amount: 9_000n, queued_total: 9_000n, slot: 2200n }),
        brakeEngaged({ queued_total: 9_000n, slot: 2200n }),
        poolTrade({ is_buy: false, queued_remainder: 9_000n, slot: 2200n, timestamp: T0 + 800n, queued: 9_000n }),
      ]),
      rawTx([redeemed({ circulating_after: 784_682_885_522_218n - 9_000n, queued: 9_000n })]),
    ];
    for (const tx of seq) expect((await processTransaction(store, tx, PROGRAM_ID)).status).toBe("applied");

    const coin = store.coin(MINT)!;
    expect(coin.phase).toBe("graduated");
    expect(coin.queued).toBe(9_000n);
    expect(coin.brake_engaged).toBe(true);
    expect(coin.brake_engagements).toBe(1);
    expect(coin.buy_count).toBe(3);
    expect(coin.sell_count).toBe(2);
    expect(coin.redeem_count).toBe(1);

    const trades = store.trades();
    expect(trades).toHaveLength(5);
    const multi = trades.filter((t) => t.slot === 2200).sort((a, b) => a.event_index - b.event_index);
    expect(multi.map((t) => [t.event_index, t.is_queue_fill, t.ix_index])).toEqual([
      [0, true, 1],
      [3, false, 1],
    ]);
    expect(trades.find((t) => t.slot === 1001)?.price_after).toBe("0.000000027977451302"); // (30 SOL + real) / (virtual − sold)

    // Both curve trades fall in the same 1m and 1h candle; graduation trades in others.
    const c1m = store.candles().filter((c) => c.interval === "1m");
    const first = c1m.find((c) => c.bucket_ts.getTime() === Math.floor((Number(T0) + 1) / 60) * 60_000)!;
    expect(first.trades).toBe(2);
    expect(first.volume_sol).toBe(20_200_000n);
    expect(store.candles().filter((c) => c.interval === "1h").reduce((n, c) => n + c.trades, 0)).toBe(5);

    expect(store.state.snapshots.size).toBe(2); // graduation + redeem
    expect(store.state.queueEvents.size).toBe(2);
    expect(store.state.redeems.size).toBe(1);
  });

  it("rolls back the whole transaction on a storage error", async () => {
    const store = new MemoryStore();
    await processTransaction(store, rawTx([coinCreated()]), PROGRAM_ID);
    const tx = rawTx([curveTrade()]);
    const broken = {
      transaction: <T>(fn: Parameters<MemoryStore["transaction"]>[0]) =>
        store.transaction(async (t) => fn({ ...t, insertTrade: async () => Promise.reject(new Error("disk full")) })) as Promise<T>,
    };
    await expect(processTransaction(broken as never, tx, PROGRAM_ID)).rejects.toThrow("disk full");
    expect(store.coin(MINT)?.buy_count).toBe(0);
    expect(store.state.processed.has(tx.signature)).toBe(false);
    expect((await processTransaction(store, tx, PROGRAM_ID)).status).toBe("applied");
  });

  it("does not trust events logged by other programs", async () => {
    const store = new MemoryStore();
    const forger = key();
    const tx = rawTx([], {
      logs: [`Program ${forger} invoke [1]`, `Program data: ${encodeEventBase64(coinCreated())}`, `Program ${forger} success`],
    });
    expect((await processTransaction(store, tx, PROGRAM_ID)).status).toBe("no_events");
    expect(store.coin(MINT)).toBeUndefined();
  });
});

describe("websocket hub", () => {
  it("filters by subscription", () => {
    const hub = new Hub();
    const a: string[] = [];
    const ca = { send: (d: string) => a.push(d) };
    hub.add(ca);
    expect(JSON.parse(hub.onMessage(ca, JSON.stringify({ subscribe: MINT }))!)).toEqual({ type: "subscribed", mint: MINT });
    const ev = { type: "Trade" as const, mint: MINT, signature: "s", slot: 1, eventIndex: 0, ts: new Date(0), data: curveTrade().data };
    hub.broadcast([ev, { ...ev, mint: key() }]);
    expect(a).toHaveLength(1);
    hub.onMessage(ca, JSON.stringify({ subscribe: "*" }));
    hub.broadcast([{ ...ev, mint: key() }]);
    expect(a).toHaveLength(2);
    expect(JSON.parse(hub.onMessage(ca, "garbage")!).type).toBe("error");
  });
});
