/**
 * Data client. Three modes (lib/env.ts, `ENV.data`):
 * - mock: in-process dataset;
 * - indexer: `${NEXT_PUBLIC_API_URL}/api/...`;
 * - chain: the site's own route handlers (`/api/...`, same JSON) backed by the
 *   server RPC; Server Components call the server module directly.
 */
import { ENV, apiBase, hasApi } from "@/lib/env";
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
  const url = `${apiBase()}/api${path}`;
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
/** Server side in chain mode: call the server module directly (never bundled for the browser: the import sits behind the window check). */
const server = () => import("@/lib/server/api");

/** Chain mode: direct call on the server, HTTP to the same origin in the browser. */
async function chain<T>(direct: (s: Awaited<ReturnType<typeof server>>["chainApi"]) => Promise<T>, path: string, init?: { revalidate?: number }): Promise<T> {
  if (typeof window === "undefined") return direct((await server()).chainApi);
  return get<T>(path, init);
}

function qs(q: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

const EMPTY_LIST: CoinListJson = { items: [], next_cursor: null };
const EMPTY_TRADES: TradeListJson = { items: [], next_before: null };

export const api = {
  /** True when lists, feeds and charts have a data source (mock, indexer or chain). */
  available: ENV.mock || hasApi || ENV.chain,

  async coins(q: { sort?: SortKey; phase?: Phase; limit?: number; cursor?: string } = {}): Promise<CoinListJson> {
    if (ENV.mock) return (await mock()).mockCoins(q);
    if (ENV.chain) return chain((s) => s.coins(q), `/coins${qs(q)}`);
    if (!hasApi) return EMPTY_LIST;
    return get<CoinListJson>(`/coins${qs(q)}`);
  },

  async coin(mint: string): Promise<CoinJson | null> {
    if (ENV.mock) return (await mock()).mockCoin(mint);
    if (!hasApi && !ENV.chain) return null;
    try {
      if (ENV.chain) return await chain((s) => s.coin(mint), `/coins/${mint}`, { revalidate: 2 });
      return await get<CoinJson>(`/coins/${mint}`, { revalidate: 2 });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },

  async trades(mint: string, limit = 50, before?: string): Promise<TradeListJson> {
    if (ENV.mock) return (await mock()).mockTrades(mint, limit);
    if (ENV.chain) return chain((s) => s.trades(mint, limit, before), `/coins/${mint}/trades${qs({ limit, before })}`, { revalidate: 2 });
    if (!hasApi) return EMPTY_TRADES;
    return get<TradeListJson>(`/coins/${mint}/trades${qs({ limit, before })}`, { revalidate: 2 });
  },

  async candles(mint: string, interval: CandleInterval): Promise<CandleListJson> {
    if (ENV.mock) return (await mock()).mockCandles(mint, interval);
    if (ENV.chain) return chain((s) => s.candles(mint, interval), `/coins/${mint}/candles${qs({ interval })}`, { revalidate: 5 });
    if (!hasApi) return { interval, unit: "SOL per token", items: [] };
    return get<CandleListJson>(`/coins/${mint}/candles${qs({ interval })}`, { revalidate: 5 });
  },

  async floor(mint: string): Promise<SnapshotListJson | null> {
    if (ENV.mock) return (await mock()).mockFloor(mint);
    if (ENV.chain) return chain((s) => s.floor(mint), `/coins/${mint}/floor`);
    if (!hasApi) return null;
    return get<SnapshotListJson>(`/coins/${mint}/floor`);
  },

  async queue(mint: string): Promise<QueueJson | null> {
    if (ENV.mock) return (await mock()).mockQueue(mint);
    if (!hasApi && !ENV.chain) return null;
    try {
      if (ENV.chain) return await chain((s) => s.queue(mint), `/coins/${mint}/queue`, { revalidate: 2 });
      return await get<QueueJson>(`/coins/${mint}/queue`, { revalidate: 2 });
    } catch {
      return null;
    }
  },

  async holders(mint: string): Promise<HoldersJson | null> {
    if (ENV.mock) return (await mock()).mockHolders(mint);
    if (!hasApi && !ENV.chain) return null;
    try {
      if (ENV.chain) return await chain((s) => s.holders(mint), `/coins/${mint}/holders`, { revalidate: 30 });
      return await get<HoldersJson>(`/coins/${mint}/holders`, { revalidate: 30 });
    } catch {
      return null;
    }
  },

  async stats(): Promise<StatsJson | null> {
    if (ENV.mock) return (await mock()).mockStats();
    if (!hasApi && !ENV.chain) return null;
    try {
      if (ENV.chain) return await chain((s) => s.stats(), `/stats`, { revalidate: 10 });
      return await get<StatsJson>(`/stats`, { revalidate: 10 });
    } catch {
      return null;
    }
  },

  async portfolio(owner: string): Promise<PortfolioJson | null> {
    if (ENV.mock) return (await mock()).mockPortfolio(owner);
    if (ENV.chain) return chain((s) => s.portfolio(owner), `/portfolio/${owner}`);
    if (!hasApi) return null;
    return get<PortfolioJson>(`/portfolio/${owner}`);
  },
};

/** Fetch that never throws: lists render their empty state when the data source is down. */
export async function safely<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}
