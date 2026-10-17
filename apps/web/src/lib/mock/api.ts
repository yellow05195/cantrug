/**
 * In-process implementation of the indexer API over the mock dataset.
 * One dataset per JS realm (server process, browser tab).
 */
import { coinFloorQ64, coinPriceQ64, valueAtQ64 } from "@floored/sdk";
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
import { advanceTo, createDataset, type Dataset } from "./dataset";
import { candles, coinJson, holdersJson, queueJson, snapshots, tradeJson } from "./serialize";

const g = globalThis as unknown as { __flooredMock?: Dataset; __flooredMockFactory?: unknown };

/** One dataset per realm; regenerated when the generator module is reloaded (dev HMR). */
export function dataset(): Dataset {
  if (!g.__flooredMock || g.__flooredMockFactory !== createDataset) {
    g.__flooredMock = createDataset();
    g.__flooredMockFactory = createDataset;
  }
  return g.__flooredMock;
}

function fresh(): Dataset {
  const ds = dataset();
  advanceTo(ds, Date.now());
  return ds;
}

export async function mockCoins(q: { sort?: SortKey; phase?: Phase; limit?: number }): Promise<CoinListJson> {
  const ds = fresh();
  const now = Date.now();
  let items = ds.coins.map((c) => coinJson(c, now));
  if (q.phase) items = items.filter((c) => c.phase === q.phase);
  const sort = q.sort ?? "new";
  const n = (s: string) => Number(s);
  items.sort((a, b) => {
    switch (sort) {
      case "graduating":
        return (b.graduation_progress_bps ?? 0) - (a.graduation_progress_bps ?? 0);
      case "floor":
        return (b.floor?.display ?? 0) * n(b.supply) - (a.floor?.display ?? 0) * n(a.supply);
      case "volume":
        return n(b.volume_sol) - n(a.volume_sol);
      default:
        return Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? "");
    }
  });
  return { items: items.slice(0, q.limit ?? 50), next_cursor: null };
}

export async function mockCoin(mint: string): Promise<CoinJson | null> {
  const ds = fresh();
  const c = ds.byMint.get(mint);
  return c ? coinJson(c, Date.now()) : null;
}

export async function mockTrades(mint: string, limit = 50): Promise<TradeListJson> {
  const c = fresh().byMint.get(mint);
  if (!c) return { items: [], next_before: null };
  const items = c.trades.map((t, i) => tradeJson(c, t, i)).reverse().slice(0, limit);
  return { items, next_before: null };
}

export async function mockAllTrades(mint: string): Promise<TradeListJson> {
  const c = fresh().byMint.get(mint);
  if (!c) return { items: [], next_before: null };
  return { items: c.trades.map((t, i) => tradeJson(c, t, i)), next_before: null };
}

export async function mockCandles(mint: string, interval: CandleInterval): Promise<CandleListJson> {
  const c = fresh().byMint.get(mint);
  return { interval, unit: "SOL per token", items: c ? candles(c, interval, Date.now()) : [] };
}

export async function mockFloor(mint: string): Promise<SnapshotListJson> {
  const c = fresh().byMint.get(mint);
  const now = new Date();
  return { interval: "1m", from: new Date(now.getTime() - 86_400_000).toISOString(), to: now.toISOString(), items: c ? snapshots(c) : [] };
}

export async function mockQueue(mint: string): Promise<QueueJson | null> {
  const c = fresh().byMint.get(mint);
  return c ? queueJson(c, Date.now()) : null;
}

export async function mockHolders(mint: string): Promise<HoldersJson | null> {
  const c = fresh().byMint.get(mint);
  return c ? holdersJson(c) : null;
}

export async function mockStats(): Promise<StatsJson> {
  const ds = fresh();
  const b = ds.baseline;
  const byDay = new Map(b.byDay.map((d) => [d.day, { lamports: d.lamports, count: d.count }]));
  let redeemed = b.redeemedLamports;
  const biggest: StatsJson["biggest_redeems"] = [];
  let brakes = b.brakes;
  let rugs = b.rugsAvoided;
  for (const c of ds.coins) {
    redeemed += c.state.totalRedeemedSol;
    brakes += c.state.brake.engagements;
    for (const t of c.trades) {
      if (t.kind !== "redeem") continue;
      const day = new Date(t.ms).toISOString().slice(0, 10);
      const cur = byDay.get(day) ?? { lamports: 0n, count: 0 };
      byDay.set(day, { lamports: cur.lamports + t.sol, count: cur.count + 1 });
      biggest.push({ mint: c.state.mint.toBase58(), symbol: c.meta.symbol, user: t.user, sol_out: t.sol.toString(), ts: new Date(t.ms).toISOString() });
    }
    // A brake that queued ≥ 10 % of supply counts as a rug avoided.
    const big = c.queueEvents.filter((e) => e.kind === "joined" && e.amount !== null && e.amount * 10n >= c.supply).length;
    rugs += big;
  }
  biggest.sort((a, b) => (BigInt(b.sol_out) > BigInt(a.sol_out) ? 1 : -1));
  const series = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return {
    sol_redeemed_total: redeemed.toString(),
    sol_redeemed_total_display: Number(redeemed) / 1e9,
    coins_created: b.coinsCreated + ds.coins.length,
    coins_graduated: b.coinsGraduated + ds.coins.filter((c) => c.state.phase === 1).length,
    brake_engagements_total: brakes,
    rugs_avoided: rugs,
    updated_at: new Date().toISOString(),
    sol_redeemed_by_day: series.map(([day, v]) => ({ day, sol_out: v.lamports.toString(), sol_out_display: Number(v.lamports) / 1e9, count: v.count })),
    biggest_redeems: biggest.slice(0, 8),
  };
}

export async function mockPortfolio(owner: string): Promise<PortfolioJson> {
  const ds = fresh();
  const now = Date.now();
  let tp = 0n;
  let tf = 0n;
  const items = ds.coins.flatMap((c) => {
    const bal = c.holders.get(owner) ?? 0n;
    const pos = c.positions.get(owner);
    if (bal === 0n && !pos) return [];
    const cj = coinJson(c, now);
    const atPrice = valueAtQ64(coinPriceQ64(c.state), bal);
    const atFloor = valueAtQ64(coinFloorQ64(c.state, c.supply), bal);
    tp += atPrice;
    tf += atFloor;
    const mine = c.trades.filter((t) => t.user === owner);
    return [
      {
        mint: cj.mint,
        name: cj.name,
        symbol: cj.symbol,
        image_url: cj.image_url,
        phase: cj.phase,
        balance: bal.toString(),
        balance_display: Number(bal) / 1e6,
        balance_source: "holders" as const,
        price: cj.price,
        floor: cj.floor,
        floor_preview: cj.floor_preview,
        floor_active: cj.floor_active,
        value_at_price: atPrice.toString(),
        value_at_price_display: Number(atPrice) / 1e9,
        value_at_floor: atFloor.toString(),
        value_at_floor_display: Number(atFloor) / 1e9,
        trades: mine.length,
        sol_spent: mine.filter((t) => t.kind === "buy").reduce((a, t) => a + t.sol, 0n).toString(),
        sol_received: mine.filter((t) => t.kind === "sell").reduce((a, t) => a + t.sol, 0n).toString(),
        sol_redeemed: mine.filter((t) => t.kind === "redeem").reduce((a, t) => a + t.sol, 0n).toString(),
        last_trade_at: mine.length ? new Date(mine[mine.length - 1]!.ms).toISOString() : null,
      },
    ];
  });
  return {
    owner,
    items,
    total_value_at_price: tp.toString(),
    total_value_at_price_display: Number(tp) / 1e9,
    total_value_at_floor: tf.toString(),
    total_value_at_floor_display: Number(tf) / 1e9,
    note: "Mock data.",
  };
}
