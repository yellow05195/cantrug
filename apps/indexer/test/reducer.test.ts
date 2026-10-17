import { describe, expect, it } from "vitest";
import type { FlooredEvent } from "../src/chain/types.js";
import type { CoinRow } from "../src/db/schema.js";
import { decimalToRatio } from "../src/domain/math.js";
import { reduceCoin, rowFloor } from "../src/domain/reducer.js";
import { BOB, brakeEngaged, brakeReleased, coinCreated, curveTrade, graduated, MINT, poolTrade, queueJoined, queueProcessed, queueSettled, redeemed, SUPPLY, T0 } from "./fixtures.js";

const at = (s: bigint | number) => ({ ts: new Date(Number(s) * 1000) });

function run(events: FlooredEvent[], start: CoinRow | null = null): CoinRow {
  let row = start;
  for (const e of events) {
    const ts = "timestamp" in e.data ? e.data.timestamp : T0;
    row = reduceCoin(row, e, at(ts));
  }
  return row!;
}

/** Pool sell vector: 777 777 tokens into S = 87 252 029 914, T = 202 193 659 477 782. */
const poolSell = poolTrade({
  is_buy: false,
  user: BOB,
  sol_amount: 332_673_946n,
  token_amount: 777_777_000_000n,
  fee_total: 1_671_729n,
  fee_to_floor: 668_691n,
  sol_reserves: 86_918_352_930n,
  token_reserves: 202_971_436_477_782n,
  pool_sol: 86_918_352_930n,
  pool_tok: 202_971_436_477_782n,
  slot: 2200n,
  timestamp: T0 + 800n,
});

describe("reduceCoin", () => {
  it("CoinCreated starts the curve at the virtual reserves", () => {
    const r = run([coinCreated()]);
    expect(r).toMatchObject({ mint: MINT, name: "Floor Cat", symbol: "FCAT", phase: "curve", created_slot: 1000, last_event_slot: 1000, supply: SUPPLY });
    expect(r.created_ts?.toISOString()).toBe(new Date(Number(T0) * 1000).toISOString());
    expect(r.price_lamports_per_token).toBe("27.958993476234"); // 30 SOL / 1 073 000 000 tokens
    expect(r.floor_lamports_per_token).toBe("0");
    expect(r.brake_window_start).toBe(1000);
    expect(r.params?.virtual_tok).toBe("1073000000000000");
  });

  it("a curve trade projects reserves, tokens_sold and the floor preview", () => {
    const r = run([coinCreated(), curveTrade()]);
    expect(r.tokens_sold).toBe(354_008_574_488n);
    expect(r.real_sol).toBe(9_900_990n);
    expect(r.floor_reserve).toBe(29_703n);
    expect(r.buy_count).toBe(1);
    expect(r.volume_sol).toBe(10_000_000n);
    expect(r.circulating).toBe(354_008_574_488n);
    // floor preview = real_sol / tokens_sold, in lamports per token
    expect(r.floor_lamports_per_token).toBe("27.968220866739");
    expect(r.last_trade_ts?.getTime()).toBe(Number(T0 + 1n) * 1000);
  });

  it("graduation switches to pool pricing and the active floor", () => {
    const r = run([coinCreated(), curveTrade(), graduated()]);
    expect(r.phase).toBe("graduated");
    expect(r.graduated_slot).toBe(2000);
    expect(r.real_sol).toBe(0n);
    expect(r.pool_sol).toBe(85_258_029_914n);
    expect(r.tokens_sold).toBe(793_086_956_520_892n);
    expect(r.circulating).toBe(SUPPLY - 206_913_043_479_108n);
    expect(r.price_lamports_per_token).toBe("412.047633539393");
    expect(r.floor_lamports_per_token).toBe("107.50149048978");
    expect(r.brake_window_start).toBe(2000);
    expect(r.brake_ref_sol).toBe(85_258_029_914n);
    expect(r.mcap_sol).toBe((85_258_029_914n * SUPPLY) / 206_913_043_479_108n);
  });

  it("a redeem never lowers the floor and takes queued from the event", () => {
    const before = run([coinCreated(), curveTrade(), graduated(), poolTrade(), poolSell]);
    const after = reduceCoin(before, redeemed(), at(T0 + 900n));
    const f0 = decimalToRatio(before.floor_lamports_per_token);
    const f1 = decimalToRatio(after.floor_lamports_per_token);
    expect(f1.num * f0.den >= f0.num * f1.den).toBe(true);
    expect(after.queued).toBe(0n);
    expect(after.supply).toBe(SUPPLY - 12_345_678_000_000n - 3_143_952_566_617n);
    expect(after.total_redeemed_sol).toBe(1_339_601_510n);
    expect(after.redeem_count).toBe(1);
    expect(after.circulating).toBe(797_028_563_522_218n - 12_345_678_000_000n);

    // With tokens in the queue the event says so directly.
    const queuedRow = reduceCoin(before, redeemed({ circulating_after: 784_682_885_522_218n - 5_000n, queued: 5_000n, slot: 2301n }), at(T0 + 901n));
    expect(queuedRow.queued).toBe(5_000n);
    expect(queuedRow.brake_engaged).toBe(true);
  });

  it("never goes backwards in slot, but still counts late events", () => {
    const latest = run([coinCreated(), curveTrade({ slot: 1500n, real_sol: 50_000_000_000n, token_reserves: 500_000_000_000_000n })]);
    const late = reduceCoin(latest, curveTrade({ slot: 1200n, real_sol: 1n, token_reserves: 1_000_000_000_000_000n, sol_amount: 7n }), at(T0 + 2n));
    expect(late.real_sol).toBe(50_000_000_000n);
    expect(late.token_reserves).toBe(500_000_000_000_000n);
    expect(late.last_event_slot).toBe(1500);
    expect(late.buy_count).toBe(2);
    expect(late.volume_sol).toBe(10_000_007n);
    // Equal slot: the later-applied event wins.
    const same = reduceCoin(latest, curveTrade({ slot: 1500n, real_sol: 51_000_000_000n, token_reserves: 499_000_000_000_000n }), at(T0 + 3n));
    expect(same.real_sol).toBe(51_000_000_000n);
  });

  it("events before CoinCreated build a skeleton that CoinCreated completes without rewinding", () => {
    const r1 = reduceCoin(null, curveTrade({ slot: 1001n }), at(T0 + 1n));
    expect(r1.name).toBe("");
    expect(r1.tokens_sold).toBe(354_008_574_488n); // from the event, no params needed
    const r2 = reduceCoin(r1, coinCreated(), at(T0));
    expect(r2.name).toBe("Floor Cat");
    expect(r2.real_sol).toBe(9_900_990n);
    expect(r2.last_event_slot).toBe(1001);
  });

  it("tracks the brake from queue events (window fill closes the epoch)", () => {
    let r = run([coinCreated(), curveTrade(), graduated()]);
    r = reduceCoin(r, queueJoined({ amount: 1_000n, queued_total: 1_000n, slot: 2400n }), at(T0 + 1000n));
    r = reduceCoin(r, brakeEngaged({ window_start: 2350n, ref_sol: 1n, ref_tok: 2n, queued_total: 1_000n, slot: 2400n }), at(T0 + 1000n));
    expect(r).toMatchObject({ brake_engaged: true, queued: 1_000n, brake_engagements: 1, brake_window_start: 2350 });
    // Partial cancel: the event carries the queue size after it.
    r = reduceCoin(r, queueSettled({ kind: 1, tokens_returned: 400n, queued_after: 600n, slot: 2410n }), at(T0 + 1001n));
    expect(r.queued).toBe(600n);
    r = reduceCoin(r, queueProcessed({ epoch: 0, window_start: 2500n, sold: 600n, queued_after: 0n, closed_epoch: true, slot: 2500n }), at(T0 + 1100n));
    r = reduceCoin(r, brakeReleased({ epoch: 0, reason: 0, slot: 2500n }), at(T0 + 1100n));
    expect(r).toMatchObject({ brake_engaged: false, queued: 0n, brake_epoch: 1, brake_window_start: 2500 });
    expect(rowFloor(r)).not.toBeNull();
  });

  it("a cancel that empties the queue releases the brake without closing the epoch", () => {
    let r = run([coinCreated(), curveTrade(), graduated()]);
    r = reduceCoin(r, queueJoined({ amount: 700n, queued_total: 700n, epoch: 3, slot: 2400n }), at(T0 + 1000n));
    r = reduceCoin(r, brakeEngaged({ queued_total: 700n, epoch: 3, slot: 2400n }), at(T0 + 1000n));
    r = reduceCoin(r, queueSettled({ kind: 1, tokens_returned: 700n, queued_after: 0n, epoch: 3, slot: 2450n }), at(T0 + 1010n));
    expect(r).toMatchObject({ queued: 0n, brake_engaged: false });
    r = reduceCoin(r, brakeReleased({ epoch: 3, reason: 1, slot: 2450n }), at(T0 + 1010n));
    expect(r).toMatchObject({ queued: 0n, brake_engaged: false, brake_epoch: 3 });
  });

  it("takes tokens_sold and supply from the events", () => {
    const r = run([coinCreated({ supply: SUPPLY - 1n }), curveTrade({ tokens_sold: 123n, supply: SUPPLY - 1n })]);
    expect(r.tokens_sold).toBe(123n);
    expect(r.supply).toBe(SUPPLY - 1n);
    const created = run([coinCreated({ supply: 42n })]);
    expect(created.supply).toBe(42n);
  });
});
