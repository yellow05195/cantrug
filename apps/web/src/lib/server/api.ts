/**
 * The chain-mode data API: the same methods and JSON as the indexer client,
 * served from the program's accounts and transaction history. Server
 * Components call these directly; the browser reaches them through the route
 * handlers in app/api.
 */
import type {
  CandleInterval,
  CandleListJson,
  CoinJson,
  CoinListJson,
  HoldersJson,
  Phase,
  PortfolioJson,
  QueueJson,
  SnapshotListJson,
  SortKey,
  StatsJson,
  TradeListJson,
} from "@/lib/api/types";
import { candlesFrom, snapshotsFrom } from "./candles";
import { getCoin, listCoins } from "./coins";
import { programEvents, type EventsPage } from "./events";
import { derive } from "./history";
import { holders } from "./holders";
import { portfolio } from "./portfolio";
import { stats } from "./stats";

const FLOOR_SECONDS: Record<string, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14_400, "1d": 86_400 };

export const chainApi = {
  coins(q: { sort?: SortKey; phase?: Phase; limit?: number; cursor?: string } = {}): Promise<CoinListJson> {
    return listCoins(q);
  },

  coin(mint: string): Promise<CoinJson | null> {
    return getCoin(mint);
  },

  async trades(mint: string, limit = 50, before?: string): Promise<TradeListJson> {
    const { rows } = await derive(mint);
    let start = 0;
    if (before) {
      if (/^\d+$/.test(before)) {
        const slot = Number(before);
        start = rows.findIndex((r) => r.slot < slot);
        if (start < 0) start = rows.length;
      } else {
        const i = rows.findIndex((r) => r.signature === before);
        start = i < 0 ? 0 : i + 1;
      }
    }
    const items = rows.slice(start, start + limit);
    const last = items[items.length - 1];
    return { items, next_before: items.length === limit && last ? String(last.slot) : null };
  },

  async candles(mint: string, interval: CandleInterval): Promise<CandleListJson> {
    const { ticks } = await derive(mint);
    return { interval, unit: "SOL per token", items: candlesFrom(ticks, interval) };
  },

  async floor(mint: string, q: { interval?: string; from?: Date; to?: Date } = {}): Promise<SnapshotListJson> {
    const interval = q.interval && FLOOR_SECONDS[q.interval] ? q.interval : "1m";
    const to = q.to ?? new Date();
    const from = q.from ?? new Date(to.getTime() - 86_400_000);
    const { ticks } = await derive(mint);
    return { interval, from: from.toISOString(), to: to.toISOString(), items: snapshotsFrom(ticks, FLOOR_SECONDS[interval]!, from, to) };
  },

  async queue(mint: string): Promise<QueueJson | null> {
    const coin = await getCoin(mint);
    if (!coin) return null;
    const { queue } = await derive(mint);
    return {
      brake: coin.brake,
      entries: [],
      entries_note: "Per-wallet positions are read on chain by the coin page (QueueEntry); this endpoint lists the queue's events.",
      recent: queue.slice(0, 50),
    };
  },

  holders(mint: string, limit = 50): Promise<HoldersJson | null> {
    return holders(mint, limit);
  },

  stats(): Promise<StatsJson> {
    return stats();
  },

  portfolio(owner: string): Promise<PortfolioJson> {
    return portfolio(owner);
  },

  events(after: string | null): Promise<EventsPage> {
    return programEvents(after);
  },
};

export type ChainApi = typeof chainApi;
