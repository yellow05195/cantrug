import type { TradeEvent } from "../chain/types.js";
import type { CoinRow, FloorSnapshotRow } from "../db/schema.js";
import { floorPreviewRatio, floorRatio, priceRatio, solPerToken, type Ratio } from "./math.js";
import { rowFloor, rowPrice } from "./reducer.js";

export const minuteOf = (ts: Date): Date => new Date(Math.floor(ts.getTime() / 60_000) * 60_000);

const sol = (r: Ratio | null): string => (r ? solPerToken(r) : "0");

export function snapshotFromCoin(row: CoinRow, ts: Date): FloorSnapshotRow {
  return {
    mint: row.mint,
    minute: minuteOf(ts),
    ts,
    floor: sol(rowFloor(row)),
    price: sol(rowPrice(row)),
    pool_sol: row.pool_sol,
    pool_tok: row.pool_tok,
    circulating: row.circulating,
    floor_active: row.phase === "graduated",
  };
}

/** Price and floor (SOL per token) right after a trade, from the event's own post-state. */
export function tradePriceFloor(e: TradeEvent): { price: string; floor: string } {
  const price = priceRatio(e.sol_reserves, e.token_reserves);
  const floor = e.phase === 1 ? floorRatio(e.pool_sol, e.supply, e.pool_tok, e.queued) : floorPreviewRatio(e.real_sol, e.tokens_sold);
  return { price: sol(price), floor: sol(floor) };
}
