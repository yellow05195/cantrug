/** Event builders and realistic transaction logs, encoded with the same borsh layouts as the program. */
import { Keypair } from "@solana/web3.js";
import { encodeEventBase64 } from "../src/chain/events.js";
import type {
  CoinCreatedEvent,
  CoinParams,
  FlooredEvent,
  GraduatedEvent,
  RedeemedEvent,
  TradeEvent,
} from "../src/chain/types.js";
import type { RawTransaction } from "../src/ingest/handler.js";

export const PROGRAM_ID = "E7ZbamLD8wenjjHitR8bUHwuNKA4Em39sqybnhk3nc87";
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";

export const key = (): string => Keypair.generate().publicKey.toBase58();

export const MINT = key();
export const COIN = key();
export const CREATOR = key();
export const ALICE = key();
export const BOB = key();

export const DEFAULT_PARAMS: CoinParams = {
  virtual_sol: 30_000_000_000n,
  virtual_tok: 1_073_000_000_000_000n,
  curve_supply: 793_100_000_000_000n,
  graduation_sol: 85_000_000_000n,
  curve_fee_bps: 100,
  curve_fee_creator_share_bps: 4000,
  curve_fee_protocol_share_bps: 3000,
  pool_fee_bps: 50,
  pool_fee_pool_share_bps: 4000,
  pool_fee_creator_share_bps: 4000,
  redeem_fee_bps: 50,
  brake_drop_bps: 2000,
  brake_window_slots: 150n,
};

export const SUPPLY = 1_000_000_000_000_000n;
export const T0 = 1_760_000_000n; // unix seconds

export function coinCreated(over: Partial<CoinCreatedEvent> = {}): FlooredEvent {
  return {
    name: "CoinCreated",
    data: {
      mint: MINT,
      coin: COIN,
      creator: CREATOR,
      name: "Floor Cat",
      symbol: "FCAT",
      uri: "https://example.com/fcat.json",
      params: DEFAULT_PARAMS,
      supply: SUPPLY,
      slot: 1000n,
      timestamp: T0,
      ...over,
    },
  };
}

/** A curve buy using the first vector of floored-core (10 000 000 lamports in). */
export function curveTrade(over: Partial<TradeEvent> = {}): FlooredEvent {
  const tokensSold = over.token_reserves !== undefined ? DEFAULT_PARAMS.virtual_tok - over.token_reserves : 354_008_574_488n;
  const realSol = over.real_sol ?? 9_900_990n;
  return {
    name: "Trade",
    data: {
      mint: MINT,
      user: ALICE,
      is_buy: true,
      phase: 0,
      is_queue_fill: false,
      sol_amount: 10_000_000n,
      token_amount: 354_008_574_488n,
      fee_total: 99_010n,
      fee_to_floor: 29_703n,
      sol_reserves: DEFAULT_PARAMS.virtual_sol + realSol,
      token_reserves: DEFAULT_PARAMS.virtual_tok - tokensSold,
      real_sol: realSol,
      tokens_sold: tokensSold,
      floor_reserve: 29_703n,
      pool_sol: 0n,
      pool_tok: 0n,
      queued: 0n,
      supply: SUPPLY,
      queued_remainder: 0n,
      slot: 1001n,
      timestamp: T0 + 1n,
      ...over,
    },
  };
}

/** Graduation vector from floored-core. */
export function graduated(over: Partial<GraduatedEvent> = {}): FlooredEvent {
  return {
    name: "Graduated",
    data: {
      mint: MINT,
      caller: BOB,
      pool_sol: 85_258_029_914n,
      pool_tok: 206_913_043_479_108n,
      floor_reserve_added: 258_029_914n,
      tokens_sold: 793_086_956_520_892n,
      supply: SUPPLY,
      slot: 2000n,
      timestamp: T0 + 600n,
      ...over,
    },
  };
}

export function poolTrade(over: Partial<TradeEvent> = {}): FlooredEvent {
  return {
    name: "Trade",
    data: {
      mint: MINT,
      user: ALICE,
      is_buy: true,
      phase: 1,
      is_queue_fill: false,
      sol_amount: 2_000_000_001n,
      token_amount: 4_719_384_001_326n,
      fee_total: 10_000_001n,
      fee_to_floor: 4_000_000n,
      sol_reserves: 87_252_029_914n,
      token_reserves: 202_193_659_477_782n,
      real_sol: 0n,
      tokens_sold: 793_086_956_520_892n,
      floor_reserve: 0n,
      pool_sol: 87_252_029_914n,
      pool_tok: 202_193_659_477_782n,
      queued: 0n,
      supply: SUPPLY,
      queued_remainder: 0n,
      slot: 2100n,
      timestamp: T0 + 700n,
      ...over,
    },
  };
}

/** Redeem vector from floored-core: x = 12 345 678 tokens at S = 86 918 352 930, T = 202 971 436 477 782. */
export function redeemed(over: Partial<RedeemedEvent> = {}): FlooredEvent {
  return {
    name: "Redeemed",
    data: {
      mint: MINT,
      user: BOB,
      tokens_burned: 12_345_678_000_000n,
      pool_tokens_burned: 3_143_952_566_617n,
      sol_out: 1_339_601_510n,
      fee_kept: 6_731_666n,
      pool_sol_after: 85_578_751_420n,
      pool_tok_after: 199_827_483_911_165n,
      supply_after: SUPPLY - 12_345_678_000_000n - 3_143_952_566_617n,
      circulating_after: 797_028_563_522_218n - 12_345_678_000_000n,
      queued: 0n,
      from_queue: false,
      slot: 2300n,
      timestamp: T0 + 900n,
      ...over,
    },
  };
}

type Data<N extends FlooredEvent["name"]> = Extract<FlooredEvent, { name: N }>["data"];
const ts = (slot: bigint) => T0 + slot - 1000n;

export function queueJoined(over: Partial<Data<"QueueJoined">> = {}): FlooredEvent {
  const slot = over.slot ?? 2200n;
  return { name: "QueueJoined", data: { mint: MINT, user: ALICE, amount: 1_000n, queued_total: 1_000n, epoch: 0, slot, timestamp: ts(slot), ...over } };
}
export function brakeEngaged(over: Partial<Data<"BrakeEngaged">> = {}): FlooredEvent {
  const slot = over.slot ?? 2200n;
  return { name: "BrakeEngaged", data: { mint: MINT, window_start: 2150n, ref_sol: 1n, ref_tok: 1n, queued_total: 1_000n, epoch: 0, slot, timestamp: ts(slot), ...over } };
}
export function brakeReleased(over: Partial<Data<"BrakeReleased">> = {}): FlooredEvent {
  const slot = over.slot ?? 2500n;
  return { name: "BrakeReleased", data: { mint: MINT, epoch: 0, reason: 0, slot, timestamp: ts(slot), ...over } };
}
export function queueProcessed(over: Partial<Data<"QueueProcessed">> = {}): FlooredEvent {
  const slot = over.slot ?? 2500n;
  return {
    name: "QueueProcessed",
    data: { mint: MINT, caller: BOB, epoch: 0, window_start: 2500n, sold: 1_000n, sol_out: 1n, queued_after: 0n, closed_epoch: true, crank_reward: 0n, slot, timestamp: ts(slot), ...over },
  };
}
export function queueSettled(over: Partial<Data<"QueueSettled">> = {}): FlooredEvent {
  const slot = over.slot ?? 2410n;
  return {
    name: "QueueSettled",
    data: { mint: MINT, user: ALICE, kind: 1, tokens_returned: 0n, tokens_redeemed: 0n, sol_paid: 0n, queued_after: 0n, epoch: 0, slot, timestamp: ts(slot), ...over },
  };
}
export function feesClaimed(over: Partial<Data<"FeesClaimed">> = {}): FlooredEvent {
  const slot = over.slot ?? 2253n;
  return { name: "FeesClaimed", data: { mint: MINT, kind: 1, recipient: BOB, amount: 42n, slot, timestamp: ts(slot), ...over } };
}

/** Logs of a transaction: compute budget ix, then one FLOORED ix that emits `events` (with a token CPI in between). */
export function programLogs(events: FlooredEvent[], programId = PROGRAM_ID): string[] {
  const logs = [`Program ${COMPUTE_BUDGET} invoke [1]`, `Program ${COMPUTE_BUDGET} success`, `Program ${programId} invoke [1]`, "Program log: Instruction: Sell"];
  events.forEach((e, i) => {
    if (i > 0) {
      logs.push(`Program ${TOKEN_PROGRAM} invoke [2]`, "Program log: Instruction: Transfer", `Program ${TOKEN_PROGRAM} consumed 4645 of 180000 compute units`, `Program ${TOKEN_PROGRAM} success`);
    }
    logs.push(`Program data: ${encodeEventBase64(e)}`);
  });
  logs.push(`Program ${programId} consumed 61234 of 200000 compute units`, `Program ${programId} success`);
  return logs;
}

let sigCounter = 0;
export function signature(): string {
  // 88-char base58-ish unique string
  sigCounter++;
  return (`5${"1".repeat(80)}${sigCounter.toString().padStart(7, "A")}`).replace(/0/g, "A").slice(0, 88);
}

export function rawTx(events: FlooredEvent[], over: Partial<RawTransaction> = {}): RawTransaction {
  const slot = events[0] ? Number(events[0].data.slot) : 1;
  return { signature: signature(), slot, blockTime: Number(T0) + slot, err: null, logs: programLogs(events), ...over };
}

/** Helius raw webhook item for the same transaction. */
export function heliusTx(raw: RawTransaction) {
  return {
    blockTime: raw.blockTime,
    indexWithinBlock: 3,
    meta: { err: raw.err, fee: 5000, logMessages: raw.logs, postBalances: [], preBalances: [] },
    slot: raw.slot,
    transaction: { message: { accountKeys: [], instructions: [] }, signatures: [raw.signature] },
    version: 0,
  };
}
