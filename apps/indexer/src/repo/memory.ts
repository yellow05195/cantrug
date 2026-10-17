/**
 * In-memory IngestStore for tests and local experiments. Transactions are
 * serialized and roll back on error (copy-on-begin).
 */
import type { CandleInterval, CandleRow, CoinRow, FloorSnapshotRow, QueueEventRow, RedeemRow, TradeRow } from "../db/schema.js";
import type { IngestStore, IngestTx } from "./types.js";

interface State {
  processed: Map<string, number>;
  coins: Map<string, CoinRow>;
  trades: Map<string, TradeRow>;
  redeems: Map<string, RedeemRow>;
  queueEvents: Map<string, QueueEventRow>;
  candles: Map<string, CandleRow>;
  snapshots: Map<string, FloorSnapshotRow>;
}

const empty = (): State => ({
  processed: new Map(),
  coins: new Map(),
  trades: new Map(),
  redeems: new Map(),
  queueEvents: new Map(),
  candles: new Map(),
  snapshots: new Map(),
});

const clone = (s: State): State => ({
  processed: new Map(s.processed),
  coins: new Map(s.coins),
  trades: new Map(s.trades),
  redeems: new Map(s.redeems),
  queueEvents: new Map(s.queueEvents),
  candles: new Map(s.candles),
  snapshots: new Map(s.snapshots),
});

const evKey = (sig: string, idx: number) => `${sig}#${idx}`;
const candleKey = (mint: string, interval: CandleInterval, bucket: Date) => `${mint}|${interval}|${bucket.toISOString()}`;

export class MemoryStore implements IngestStore {
  state: State = empty();
  private chain: Promise<unknown> = Promise.resolve();

  transaction<T>(fn: (tx: IngestTx) => Promise<T>): Promise<T> {
    const run = async () => {
      const working = clone(this.state);
      const tx = this.makeTx(working);
      const out = await fn(tx);
      this.state = working; // commit
      return out;
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }

  private makeTx(s: State): IngestTx {
    const insertOnce = <R>(m: Map<string, R>, key: string, row: R) => {
      if (m.has(key)) throw new Error(`duplicate key ${key}`);
      m.set(key, row);
    };
    return {
      isProcessed: async (sig) => s.processed.has(sig),
      markProcessed: async (sig, slot) => {
        s.processed.set(sig, slot);
      },
      getCoinForUpdate: async (mint) => s.coins.get(mint) ?? null,
      saveCoin: async (row) => {
        s.coins.set(row.mint, row);
      },
      insertTrade: async (row) => insertOnce(s.trades, evKey(row.signature, row.event_index), row),
      insertRedeem: async (row) => insertOnce(s.redeems, evKey(row.signature, row.event_index), row),
      insertQueueEvent: async (row) => insertOnce(s.queueEvents, evKey(row.signature, row.event_index), row),
      getCandleForUpdate: async (mint, interval, bucket) => s.candles.get(candleKey(mint, interval, bucket)) ?? null,
      saveCandle: async (row) => {
        s.candles.set(candleKey(row.mint, row.interval, row.bucket_ts), row);
      },
      saveFloorSnapshot: async (row) => {
        s.snapshots.set(`${row.mint}|${row.minute.toISOString()}`, row);
      },
    };
  }

  // Convenience accessors for tests.
  coin(mint: string): CoinRow | undefined {
    return this.state.coins.get(mint);
  }
  trades(): TradeRow[] {
    return [...this.state.trades.values()];
  }
  candles(): CandleRow[] {
    return [...this.state.candles.values()];
  }
}
