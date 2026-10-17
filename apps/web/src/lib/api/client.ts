/**
 * Indexer REST client. Three modes:
 * - mock (NEXT_PUBLIC_MOCK=1, default without an API URL): in-process dataset;
 * - live with an indexer: `${NEXT_PUBLIC_API_URL}/api/...`;
 * - live without an indexer: every call resolves empty, pages fall back to RPC reads.
 */
import { ENV, hasApi } from "@/lib/env";
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
} from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function get<T>(path: string, init?: { revalidate?: number; signal?: AbortSignal }): Promise<T> {
  const url = `${ENV.apiUrl}/api${path}`;
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: init?.signal,
    ...(typeof window === "undefined" ? { next: { revalidate: init?.revalidate ?? 5 } } : { cache: "no-store" as const }),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      msg = body.message ?? body.error ?? msg;
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

const mock = () => import("@/lib/mock/api");

function qs(q: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

const EMPTY_LIST: CoinListJson = { items: [], next_cursor: null };
const EMPTY_TRADES: TradeListJson = { items: [], next_before: null };

export const api = {
  /** True when lists, feeds and charts have a data source (mock or indexer). */
  available: ENV.mock || hasApi,

  async coins(q: { sort?: SortKey; phase?: Phase; limit?: number; cursor?: string } = {}): Promise<CoinListJson> {
    if (ENV.mock) return (await mock()).mockCoins(q);
    if (!hasApi) return EMPTY_LIST;
    return get<CoinListJson>(`/coins${qs(q)}`);
  },

  async coin(mint: string): Promise<CoinJson | null> {
    if (ENV.mock) return (await mock()).mockCoin(mint);
    if (!hasApi) return null;
    try {
      return await get<CoinJson>(`/coins/${mint}`, { revalidate: 2 });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },

  async trades(mint: string, limit = 50, before?: string): Promise<TradeListJson> {
    if (ENV.mock) return (await mock()).mockTrades(mint, limit);
    if (!hasApi) return EMPTY_TRADES;
    return get<TradeListJson>(`/coins/${mint}/trades${qs({ limit, before })}`, { revalidate: 2 });
  },

  async candles(mint: string, interval: CandleInterval): Promise<CandleListJson> {
    if (ENV.mock) return (await mock()).mockCandles(mint, interval);
    if (!hasApi) return { interval, unit: "SOL per token", items: [] };
    return get<CandleListJson>(`/coins/${mint}/candles${qs({ interval })}`, { revalidate: 5 });
  },

  async floor(mint: string): Promise<SnapshotListJson | null> {
    if (ENV.mock) return (await mock()).mockFloor(mint);
    if (!hasApi) return null;
    return get<SnapshotListJson>(`/coins/${mint}/floor`);
  },

  async queue(mint: string): Promise<QueueJson | null> {
    if (ENV.mock) return (await mock()).mockQueue(mint);
    if (!hasApi) return null;
    try {
      return await get<QueueJson>(`/coins/${mint}/queue`, { revalidate: 2 });
    } catch {
      return null;
    }
  },

  async holders(mint: string): Promise<HoldersJson | null> {
    if (ENV.mock) return (await mock()).mockHolders(mint);
    if (!hasApi) return null;
    try {
      return await get<HoldersJson>(`/coins/${mint}/holders`, { revalidate: 30 });
    } catch {
      return null;
    }
  },

  async stats(): Promise<StatsJson | null> {
    if (ENV.mock) return (await mock()).mockStats();
    if (!hasApi) return null;
    try {
      return await get<StatsJson>(`/stats`, { revalidate: 10 });
    } catch {
      return null;
    }
  },

  async portfolio(owner: string): Promise<PortfolioJson | null> {
    if (ENV.mock) return (await mock()).mockPortfolio(owner);
    if (!hasApi) return null;
    return get<PortfolioJson>(`/portfolio/${owner}`);
  },
};

/** Fetch that never throws: lists render their empty state when the indexer is down. */
export async function safely<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}
