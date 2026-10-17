import type {
  CandleInterval,
  CandleRow,
  CoinRow,
  FloorSnapshotRow,
  GlobalStatsRow,
  HolderRow,
  QueueEventRow,
  RedeemRow,
  TradeRow,
} from "../db/schema.js";

/** Write side, used inside one DB transaction per signature. */
export interface IngestTx {
  isProcessed(signature: string): Promise<boolean>;
  markProcessed(signature: string, slot: number): Promise<void>;
  /** Read the coin row and lock it for the rest of the transaction. */
  getCoinForUpdate(mint: string): Promise<CoinRow | null>;
  saveCoin(row: CoinRow): Promise<void>;
  insertTrade(row: TradeRow): Promise<void>;
  insertRedeem(row: RedeemRow): Promise<void>;
  insertQueueEvent(row: QueueEventRow): Promise<void>;
  getCandleForUpdate(mint: string, interval: CandleInterval, bucket: Date): Promise<CandleRow | null>;
  saveCandle(row: CandleRow): Promise<void>;
  /** Upsert on (mint, minute): the latest snapshot of a minute wins. */
  saveFloorSnapshot(row: FloorSnapshotRow): Promise<void>;
}

export interface IngestStore {
  transaction<T>(fn: (tx: IngestTx) => Promise<T>): Promise<T>;
}

export type CoinSort = "new" | "graduating" | "floor" | "volume";

export interface ListCoinsQuery {
  sort: CoinSort;
  phase?: "curve" | "graduated";
  limit: number;
  cursor?: string;
}

export interface DailyRedeemed {
  day: string;
  sol_out: bigint;
  count: number;
}

export interface PortfolioTradeAgg {
  mint: string;
  bought: bigint;
  sold: bigint;
  queued: bigint;
  sol_spent: bigint;
  sol_received: bigint;
  trades: number;
  last_ts: Date | null;
}

export interface PortfolioRedeemAgg {
  mint: string;
  tokens_burned: bigint;
  sol_out: bigint;
}

/** Read side, used by the public API and jobs. */
export interface ReadStore {
  ping(): Promise<boolean>;
  listCoins(q: ListCoinsQuery): Promise<{ rows: CoinRow[]; nextCursor: string | null }>;
  getCoin(mint: string): Promise<CoinRow | null>;
  getCoins(mints: string[]): Promise<CoinRow[]>;
  listTrades(mint: string, limit: number, beforeSlot?: number): Promise<TradeRow[]>;
  findTradeSlot(signature: string): Promise<number | null>;
  listFloorSnapshots(mint: string, from: Date, to: Date, intervalSeconds: number): Promise<FloorSnapshotRow[]>;
  listCandles(mint: string, interval: CandleInterval, from: Date, to: Date): Promise<CandleRow[]>;
  listQueueEvents(mint: string, limit: number): Promise<QueueEventRow[]>;
  /** Queue events since the start of the current queue episode, oldest first. */
  listQueueEpisode(mint: string): Promise<QueueEventRow[]>;
  listHolders(mint: string, limit: number): Promise<HolderRow[]>;
  getGlobalStats(): Promise<GlobalStatsRow | null>;
  redeemedByDay(days: number): Promise<DailyRedeemed[]>;
  portfolioTrades(owner: string): Promise<PortfolioTradeAgg[]>;
  portfolioRedeems(owner: string): Promise<PortfolioRedeemAgg[]>;
  /** Tokens given back to the wallet by queue cancels, per mint. */
  portfolioQueueReturns(owner: string): Promise<Map<string, bigint>>;
  portfolioHoldings(owner: string): Promise<HolderRow[]>;
}

/** Jobs that are cheaper in SQL than through the reducer. */
export interface MaintenanceStore {
  recomputeGlobalStats(): Promise<GlobalStatsRow>;
  /** One snapshot per active coin for the minute of `now`. Returns rows written. */
  snapshotActiveCoins(now: Date): Promise<number>;
  replaceHolders(mint: string, rows: { owner: string; balance: bigint }[], now: Date): Promise<void>;
  setCoinMetadata(mint: string, meta: { image_url: string | null; description: string | null }): Promise<void>;
  listMintsForHolderRefresh(limit: number): Promise<{ mint: string; coin: string }[]>;
}
