/**
 * Pre-upgrade events (devnet, before slot 512053014): shorter layouts must
 * decode strictly with the legacy layout, absent fields defaulted, and the
 * projection must rebuild them instead of trusting the zero defaults.
 */
import { describe, expect, it } from "vitest";
import type { Logger } from "pino";
import { BorshWriter } from "../src/chain/borsh.js";
import { decodeEventDetailed, decodeEventsFromLogs, encodeEvent, eventDiscriminator } from "../src/chain/events.js";
import { legacyLayout } from "../src/chain/layouts.js";
import type { FlooredEvent, TradeEvent } from "../src/chain/types.js";
import { processTransaction } from "../src/ingest/handler.js";
import { Ingestor } from "../src/ingest/ingestor.js";
import { MemoryStore } from "../src/repo/memory.js";
import {
  brakeReleased,
  coinCreated,
  COMPUTE_BUDGET,
  curveTrade,
  graduated,
  MINT,
  poolTrade,
  PROGRAM_ID,
  queueJoined,
  queueSettled,
  rawTx,
  redeemed,
  SUPPLY,
} from "./fixtures.js";

/** Encode `ev` with the pre-upgrade layout (the fields added by the upgrade are dropped). */
function encodeLegacy(ev: FlooredEvent): Uint8Array {
  const layout = legacyLayout(ev.name);
  if (!layout) throw new Error(`${ev.name} did not change`);
  return new BorshWriter().raw(eventDiscriminator(ev.name)).struct(layout, ev.data as unknown as Record<string, unknown>).toBytes();
}

const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");

function legacyLogs(payloads: Uint8Array[]): string[] {
  return [
    `Program ${COMPUTE_BUDGET} invoke [1]`,
    `Program ${COMPUTE_BUDGET} success`,
    `Program ${PROGRAM_ID} invoke [1]`,
    ...payloads.map((p) => `Program data: ${b64(p)}`),
    `Program ${PROGRAM_ID} success`,
  ];
}

describe("pre-upgrade decoding", () => {
  it("decodes a truncated pre-upgrade Trade without shifting fields", () => {
    const original = curveTrade();
    const bytes = encodeLegacy(original);
    expect(bytes.length).toBe(encodeEvent(original).length - 8); // tokens_sold (u64) missing, mid-struct
    const d = decodeEventDetailed(bytes)!;
    expect(d.missing).toEqual(["tokens_sold"]);
    const data = d.event.data as TradeEvent;
    expect(data.tokens_sold).toBe(0n); // zero default from the decoder
    // Every field present in the old payload decodes to its true value.
    expect({ ...data, tokens_sold: (original.data as TradeEvent).tokens_sold }).toEqual(original.data);
  });

  it("stays strict: a payload matching neither layout is rejected", () => {
    const legacy = encodeLegacy(curveTrade());
    expect(() => decodeEventDetailed(legacy.subarray(0, legacy.length - 1))).toThrow(/past end/);
    const current = encodeEvent(curveTrade());
    const longer = new Uint8Array(current.length + 1);
    longer.set(current);
    expect(() => decodeEventDetailed(longer)).toThrow(/trailing/);
    // Graduated did not change: no fallback, short payloads fail.
    const g = encodeEvent(graduated());
    expect(() => decodeEventDetailed(g.subarray(0, g.length - 8))).toThrow(/past end/);
  });

  it("current-layout payloads report nothing missing", () => {
    expect(decodeEventDetailed(encodeEvent(queueSettled()))!.missing).toEqual([]);
  });

  it("zero-fills every added field of the other changed events", () => {
    const qs = decodeEventDetailed(encodeLegacy(queueSettled()))!;
    expect(qs.missing).toEqual(["queued_after", "epoch", "timestamp"]);
    const br = decodeEventDetailed(encodeLegacy(brakeReleased({ reason: 1 })))!;
    expect(br.missing).toEqual(["reason", "timestamp"]);
    expect(br.event.data).toMatchObject({ reason: 0, timestamp: 0n });
    expect(decodeEventDetailed(encodeLegacy(coinCreated()))!.missing).toEqual(["supply"]);
    expect(decodeEventDetailed(encodeLegacy(redeemed()))!.missing).toEqual(["queued"]);
    expect(decodeEventsFromLogs(legacyLogs([encodeLegacy(curveTrade())]), PROGRAM_ID)[0]!.missing).toEqual(["tokens_sold"]);
  });
});

describe("pre-upgrade projection", () => {
  it("rebuilds tokens_sold of a truncated Trade instead of using the zero default", async () => {
    const store = new MemoryStore();
    await processTransaction(store, rawTx([coinCreated()]), PROGRAM_ID);
    const res = await processTransaction(store, rawTx([], { slot: 1001, logs: legacyLogs([encodeLegacy(curveTrade())]) }), PROGRAM_ID);
    expect(res.status).toBe("applied");
    expect(res.legacyFields).toEqual(["Trade.tokens_sold"]);
    const coin = store.coin(MINT)!;
    expect(coin.tokens_sold).toBe(354_008_574_488n); // virtual_tok − token_reserves
    expect(coin.floor_lamports_per_token).toBe("27.968220866739");
    expect(store.trades()[0]!.floor_after).toBe("0.000000027968220866");
  });

  it("rebuilds queue size, epoch, timestamp, supply and release reason", async () => {
    const store = new MemoryStore();
    const legacyCreate = rawTx([], { slot: 1000, blockTime: 1_700_000_000, logs: legacyLogs([encodeLegacy(coinCreated())]) });
    await processTransaction(store, legacyCreate, PROGRAM_ID);
    expect(store.coin(MINT)!.supply).toBe(SUPPLY);
    await processTransaction(store, rawTx([curveTrade()]), PROGRAM_ID);
    await processTransaction(store, rawTx([graduated()]), PROGRAM_ID);
    await processTransaction(store, rawTx([], { slot: 2200, blockTime: 1_700_001_000, logs: legacyLogs([encodeLegacy(queueJoined({ amount: 1_000n, queued_total: 1_000n, epoch: 2 }))]) }), PROGRAM_ID);

    // Old cancel: no queued_after / epoch / timestamp in the payload.
    const cancel = rawTx([], { slot: 2300, blockTime: 1_700_002_000, logs: legacyLogs([encodeLegacy(queueSettled({ kind: 1, tokens_returned: 400n, queued_after: 999n, epoch: 9, slot: 2300n }))]) });
    const r = await processTransaction(store, cancel, PROGRAM_ID);
    expect(r.legacyFields).toEqual(["QueueSettled.queued_after", "QueueSettled.epoch", "QueueSettled.timestamp"]);
    expect(r.events[0]!.ts.getTime()).toBe(1_700_002_000_000);
    expect(r.events[0]!.data).toMatchObject({ queued_after: 600n, epoch: 2, timestamp: 1_700_002_000n });
    expect(store.coin(MINT)).toMatchObject({ queued: 600n, brake_epoch: 2, brake_engaged: true });
    const row = [...store.state.queueEvents.values()].find((q) => q.kind === "settled")!;
    expect(row).toMatchObject({ queued_total: 600n, epoch: 2 });
    expect(row.data["legacy_missing"]).toEqual(["queued_after", "epoch", "timestamp"]);

    // Old redeem: queued from circulating_after.
    await processTransaction(store, rawTx([poolTrade({ slot: 2400n, queued: 600n })]), PROGRAM_ID);
    const redeem = redeemed({ slot: 2500n, circulating_after: 784_682_885_522_218n - 600n });
    await processTransaction(store, rawTx([], { slot: 2500, logs: legacyLogs([encodeLegacy(redeem)]) }), PROGRAM_ID);
    expect(store.coin(MINT)!.queued).toBe(600n);

    // Old release: only window fills released the brake → reason 0 closes the epoch.
    await processTransaction(store, rawTx([], { slot: 2600, logs: legacyLogs([encodeLegacy(brakeReleased({ epoch: 2, slot: 2600n }))]) }), PROGRAM_ID);
    expect(store.coin(MINT)).toMatchObject({ queued: 0n, brake_epoch: 3, brake_engaged: false });
  });

  it("logs once per signature at debug level", async () => {
    const debug: unknown[][] = [];
    const log = { debug: (...a: unknown[]) => debug.push(a), warn: () => {}, error: () => {} } as unknown as Logger;
    const store = new MemoryStore();
    const ingestor = new Ingestor(store, PROGRAM_ID, log);
    await ingestor.ingest([
      rawTx([coinCreated()]),
      rawTx([], { slot: 1001, logs: legacyLogs([encodeLegacy(curveTrade()), encodeLegacy(curveTrade({ slot: 1001n }))]) }),
      rawTx([curveTrade({ slot: 1002n })]),
    ]);
    expect(debug).toHaveLength(1);
    expect(debug[0]![0]).toMatchObject({ fields: ["Trade.tokens_sold"] });
  });
});
