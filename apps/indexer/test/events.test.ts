import { describe, expect, it } from "vitest";
import {
  decodeEventBase64,
  decodeEventBytes,
  decodeEventsFromLogs,
  encodeEvent,
  encodeEventBase64,
  eventDiscriminator,
  extractProgramData,
  isLogTruncated,
} from "../src/chain/events.js";
import type { FlooredEvent } from "../src/chain/types.js";
import { brakeEngaged, brakeReleased, coinCreated, feesClaimed, queueJoined, queueProcessed, queueSettled, COMPUTE_BUDGET, curveTrade, graduated, key, MINT, poolTrade, PROGRAM_ID, programLogs, redeemed } from "./fixtures.js";

const allEvents: FlooredEvent[] = [
  coinCreated(),
  coinCreated({ name: "Ünicode 🐱", symbol: "", uri: "" }),
  curveTrade(),
  curveTrade({ is_buy: false, is_queue_fill: true, queued_remainder: 123n, user: key() }),
  graduated(),
  poolTrade(),
  redeemed(),
  redeemed({ from_queue: true }),
  brakeEngaged({ window_start: 2100n, ref_sol: 1n, ref_tok: 2n, queued_total: 3n, epoch: 7, slot: 2101n }),
  brakeReleased({ epoch: 4_000_000_000, reason: 1, slot: 2200n }),
  queueJoined({ amount: 18_446_744_073_709_551_615n, queued_total: 5n, epoch: 0, slot: 1n, timestamp: -1n }),
  queueProcessed({ epoch: 1, window_start: 2250n, sold: 10n, sol_out: 9n, queued_after: 0n, closed_epoch: true, crank_reward: 1_000n, slot: 2251n }),
  queueSettled({ kind: 2, tokens_returned: 0n, tokens_redeemed: 77n, sol_paid: 66n, queued_after: 12n, epoch: 3, slot: 2252n }),
  feesClaimed(),
];

describe("event borsh decoding", () => {
  it.each(allEvents.map((e) => [e.name, e] as const))("round-trips %s", (_name, ev) => {
    const decoded = decodeEventBase64(encodeEventBase64(ev));
    expect(decoded).toEqual(ev);
  });

  it("uses sha256('event:<ShortName>')[0..8] as discriminator", () => {
    // Known value from the IDL for Trade.
    expect([...eventDiscriminator("Trade")]).toEqual([24, 254, 218, 152, 253, 43, 18, 81]);
    const bytes = encodeEvent(curveTrade());
    expect([...bytes.subarray(0, 8)]).toEqual([24, 254, 218, 152, 253, 43, 18, 81]);
  });

  it("encodes a Trade with the exact borsh size (8 + 32·2 + 1 + 1 + 1 + 8·16)", () => {
    expect(encodeEvent(curveTrade()).length).toBe(8 + 64 + 3 + 16 * 8);
  });

  it("returns null for unknown discriminators and throws on trailing bytes", () => {
    expect(decodeEventBytes(new Uint8Array(40))).toBeNull();
    const b = encodeEvent(poolTrade());
    const longer = new Uint8Array(b.length + 1);
    longer.set(b);
    expect(() => decodeEventBytes(longer)).toThrow(/trailing/);
    expect(() => decodeEventBytes(b.subarray(0, b.length - 1))).toThrow(/past end/);
  });

  it("decodes i64 timestamps as signed", () => {
    const ev = curveTrade({ timestamp: -5n });
    expect((decodeEventBase64(encodeEventBase64(ev))!.data as { timestamp: bigint }).timestamp).toBe(-5n);
  });
});

describe("log extraction", () => {
  it("decodes every event emitted by the program, in order, with indexes", () => {
    const evs = [curveTrade({ is_queue_fill: true, is_buy: false }), curveTrade({ is_buy: false }), allEvents[10]!, allEvents[8]!];
    const out = decodeEventsFromLogs(programLogs(evs), PROGRAM_ID);
    expect(out.map((o) => o.event)).toEqual(evs);
    expect(out.map((o) => o.eventIndex)).toEqual([0, 1, 2, 3]);
    expect(out.every((o) => o.ixIndex === 1)).toBe(true); // compute budget is ix 0
  });

  it("ignores Program data logged by another program (forgery)", () => {
    const forger = key();
    const fake = encodeEventBase64(redeemed({ sol_out: 999_999_999_999n }));
    const logs = [
      `Program ${forger} invoke [1]`,
      `Program data: ${fake}`,
      `Program ${forger} success`,
      `Program ${PROGRAM_ID} invoke [1]`,
      `Program ${forger} invoke [2]`,
      `Program data: ${fake}`,
      `Program ${forger} success`,
      `Program data: ${encodeEventBase64(poolTrade())}`,
      `Program ${PROGRAM_ID} success`,
    ];
    const data = extractProgramData(logs, PROGRAM_ID);
    expect(data).toHaveLength(1);
    expect(decodeEventsFromLogs(logs, PROGRAM_ID).map((e) => e.event.name)).toEqual(["Trade"]);
  });

  it("skips malformed payloads without dropping the rest", () => {
    const logs = [`Program ${PROGRAM_ID} invoke [1]`, "Program data: !!!notbase64", `Program data: ${encodeEventBase64(graduated())}`, `Program ${PROGRAM_ID} success`];
    expect(decodeEventsFromLogs(logs, PROGRAM_ID).map((e) => e.event.name)).toEqual(["Graduated"]);
  });

  it("handles failed inner programs and detects truncation", () => {
    const logs = [
      `Program ${COMPUTE_BUDGET} invoke [1]`,
      `Program ${COMPUTE_BUDGET} failed: custom program error: 0x1`,
      `Program ${PROGRAM_ID} invoke [1]`,
      `Program data: ${encodeEventBase64(graduated())}`,
      "Log truncated",
    ];
    expect(decodeEventsFromLogs(logs, PROGRAM_ID)).toHaveLength(1);
    expect(isLogTruncated(logs)).toBe(true);
    expect(isLogTruncated(programLogs([graduated()]))).toBe(false);
  });
});
