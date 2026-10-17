import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  DEFAULT_PARAMS,
  EVENT_DISCRIMINATORS,
  EVENT_NAMES,
  EVENT_SCHEMAS,
  PROGRAM_ID,
  decodeEvent,
  encodeEvent,
  eventsOf,
  parseEvents,
  type EventName,
  type FieldType,
} from "../src/index.js";

const idl = JSON.parse(readFileSync(fileURLToPath(new URL("../../../programs/floored/idl/floored.json", import.meta.url)), "utf8")) as {
  events: { name: string; discriminator: number[] }[];
  types: { name: string; type: { fields: { name: string; type: unknown }[] } }[];
};

const sha8 = (s: string) => createHash("sha256").update(s).digest().subarray(0, 8);
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const idlType = (t: unknown): string => (typeof t === "string" ? t : (t as { defined: { name: string } }).defined.name);

const mint = Keypair.fromSeed(new Uint8Array(32).fill(1)).publicKey;
const user = Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey;

function u64(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}
function i64(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(n);
  return b;
}

describe("events", () => {
  it("discriminators are sha256('event:<Name>')[0..8] and match the IDL", () => {
    expect(EVENT_NAMES.sort()).toEqual(idl.events.map((e) => e.name).sort());
    for (const e of idl.events) {
      const name = e.name as EventName;
      expect([...EVENT_DISCRIMINATORS[name]]).toEqual(e.discriminator);
      expect([...EVENT_DISCRIMINATORS[name]]).toEqual([...sha8(`event:${e.name}`)]);
    }
  });

  it("schemas follow the IDL field order and types", () => {
    for (const name of EVENT_NAMES) {
      const t = idl.types.find((x) => x.name === name);
      expect(t, name).toBeDefined();
      const fromIdl = t!.type.fields.map((f) => [camel(f.name), idlType(f.type)] as [string, string]);
      expect(EVENT_SCHEMAS[name].map(([f, ty]) => [f, ty])).toEqual(fromIdl);
    }
  });

  it("decodes a Redeemed event built by hand from the logs", () => {
    const payload = Buffer.concat([
      sha8("event:Redeemed"),
      mint.toBuffer(),
      user.toBuffer(),
      u64(12_345_678_000_000n), // tokens_burned
      u64(3_143_952_566_617n), // pool_tokens_burned
      u64(1_339_601_510n), // sol_out
      u64(6_731_666n), // fee_kept
      u64(85_578_751_420n), // pool_sol_after
      u64(199_827_483_911_165n), // pool_tok_after
      u64(984_510_369_433_383n), // supply_after
      u64(784_682_885_522_218n), // circulating_after
      u64(1_500_000_000_000n), // queued
      Buffer.from([1]), // from_queue
      u64(4242n), // slot
      i64(-5n), // timestamp (signed)
    ]);
    const other = Keypair.fromSeed(new Uint8Array(32).fill(9)).publicKey.toBase58();
    const logs = [
      `Program ComputeBudget111111111111111111111111111111 invoke [1]`,
      `Program ComputeBudget111111111111111111111111111111 success`,
      `Program ${PROGRAM_ID.toBase58()} invoke [1]`,
      `Program log: Instruction: Redeem`,
      `Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [2]`,
      `Program data: ${payload.toString("base64")}`, // emitted by the token program: must be ignored
      `Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success`,
      `Program data: ${payload.toString("base64")}`,
      `Program data: ${Buffer.from("not an event at all").toString("base64")}`,
      `Program ${PROGRAM_ID.toBase58()} consumed 41234 of 200000 compute units`,
      `Program ${PROGRAM_ID.toBase58()} success`,
      `Program ${other} invoke [1]`,
      `Program data: ${payload.toString("base64")}`, // other program: ignored
      `Program ${other} success`,
    ];
    const events = parseEvents(logs);
    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(ev.name).toBe("Redeemed");
    if (ev.name !== "Redeemed") throw new Error("narrowing");
    expect(ev.data.mint.equals(mint)).toBe(true);
    expect(ev.data.user.equals(user)).toBe(true);
    expect(ev.data.tokensBurned).toBe(12_345_678_000_000n);
    expect(ev.data.poolTokensBurned).toBe(3_143_952_566_617n);
    expect(ev.data.solOut).toBe(1_339_601_510n);
    expect(ev.data.feeKept).toBe(6_731_666n);
    expect(ev.data.circulatingAfter).toBe(784_682_885_522_218n);
    expect(ev.data.queued).toBe(1_500_000_000_000n);
    expect(ev.data.fromQueue).toBe(true);
    expect(ev.data.slot).toBe(4242n);
    expect(ev.data.timestamp).toBe(-5n);

    // encodeEvent reproduces the hand-built bytes exactly
    expect(encodeEvent("Redeemed", ev.data).equals(payload)).toBe(true);
    // without program filter, all three copies decode
    expect(parseEvents(logs, { programId: null })).toHaveLength(3);
    expect(eventsOf(events, "Redeemed")).toHaveLength(1);
    expect(eventsOf(events, "Trade")).toHaveLength(0);
  });

  it("round-trips every event type, including strings and CoinParams", () => {
    let n = 1n;
    const sample = (t: FieldType): unknown => {
      n += 1n;
      switch (t) {
        case "pubkey":
          return new PublicKey(Buffer.alloc(32, Number(n % 250n)));
        case "u8":
          return Number(n % 3n);
        case "u32":
          return Number(n) * 1000;
        case "u64":
          return n * 1_000_000_007n;
        case "i64":
          return -n;
        case "bool":
          return n % 2n === 0n;
        case "string":
          return `FLOORED ✓ ${n}`;
        case "CoinParams":
          return { ...DEFAULT_PARAMS };
      }
    };
    for (const name of EVENT_NAMES) {
      const data: Record<string, unknown> = {};
      for (const [f, t] of EVENT_SCHEMAS[name]) data[f] = sample(t);
      const bytes = encodeEvent(name, data as never);
      expect([...bytes.subarray(0, 8)]).toEqual([...sha8(`event:${name}`)]);
      const back = decodeEvent(bytes);
      expect(back?.name).toBe(name);
      const norm = (o: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v instanceof PublicKey ? v.toBase58() : v]));
      expect(norm(back!.data as unknown as Record<string, unknown>)).toEqual(norm(data));
    }
  });

  it("decodes QueueSettled and BrakeReleased built by hand (new trailing fields)", () => {
    const settled = Buffer.concat([
      sha8("event:QueueSettled"),
      mint.toBuffer(),
      user.toBuffer(),
      Buffer.from([1]), // kind = cancel
      u64(200n), // tokens_returned
      u64(0n), // tokens_redeemed
      u64(49n), // sol_paid
      u64(0n), // queued_after
      Buffer.from([7, 0, 0, 0]), // epoch u32 LE
      u64(99n), // slot
      i64(1_760_000_000n), // timestamp
    ]);
    const released = Buffer.concat([
      sha8("event:BrakeReleased"),
      mint.toBuffer(),
      Buffer.from([7, 0, 0, 0]), // epoch
      Buffer.from([1]), // reason = last position left
      u64(99n),
      i64(1_760_000_000n),
    ]);
    const evs = parseEvents([
      `Program ${PROGRAM_ID.toBase58()} invoke [1]`,
      `Program data: ${settled.toString("base64")}`,
      `Program data: ${released.toString("base64")}`,
      `Program ${PROGRAM_ID.toBase58()} success`,
    ]);
    expect(evs.map((e) => e.name)).toEqual(["QueueSettled", "BrakeReleased"]);
    const [s] = eventsOf(evs, "QueueSettled");
    expect(s).toMatchObject({ kind: 1, tokensReturned: 200n, solPaid: 49n, queuedAfter: 0n, epoch: 7, slot: 99n, timestamp: 1_760_000_000n });
    const [r] = eventsOf(evs, "BrakeReleased");
    expect(r).toMatchObject({ epoch: 7, reason: 1, slot: 99n, timestamp: 1_760_000_000n });
    expect(encodeEvent("QueueSettled", s!).equals(settled)).toBe(true);
    expect(encodeEvent("BrakeReleased", r!).equals(released)).toBe(true);
  });

  it("keeps log order: in sell, QueueJoined precedes the user's Trade, whose `queued` includes the remainder", () => {
    const base = { mint, user, slot: 10n, timestamp: 20n };
    const joined = encodeEvent("QueueJoined", { ...base, amount: 300n, queuedTotal: 1_300n, epoch: 2 });
    const trade = encodeEvent("Trade", {
      ...base,
      isBuy: false,
      phase: 1,
      isQueueFill: false,
      solAmount: 5n,
      tokenAmount: 700n,
      feeTotal: 1n,
      feeToFloor: 0n,
      solReserves: 1_000n,
      tokenReserves: 2_000n,
      realSol: 0n,
      tokensSold: 793_000n,
      floorReserve: 0n,
      poolSol: 1_000n,
      poolTok: 2_000n,
      queued: 1_300n,
      supply: 1_000_000n,
      queuedRemainder: 300n,
    });
    const evs = parseEvents([
      `Program ${PROGRAM_ID.toBase58()} invoke [1]`,
      `Program data: ${joined.toString("base64")}`,
      `Program data: ${trade.toString("base64")}`,
      `Program ${PROGRAM_ID.toBase58()} success`,
    ]);
    expect(evs.map((e) => e.name)).toEqual(["QueueJoined", "Trade"]);
    const [j] = eventsOf(evs, "QueueJoined");
    const [t] = eventsOf(evs, "Trade");
    expect(t!.queued).toBe(j!.queuedTotal);
    expect(t!.tokensSold).toBe(793_000n);
    // tokens_sold sits right after real_sol: 8 disc + 2·32 + 3·1 + 7·8 (sol_amount..real_sol)
    expect(trade.readBigUInt64LE(8 + 64 + 3 + 7 * 8)).toBe(793_000n);
  });

  it("ignores unknown or short payloads", () => {
    expect(decodeEvent(new Uint8Array(4))).toBeNull();
    expect(decodeEvent(new Uint8Array(40))).toBeNull();
    expect(parseEvents(undefined)).toEqual([]);
  });
});
