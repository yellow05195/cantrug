import { Hono, type Context } from "hono";
import { z } from "zod";
import type { CandleInterval } from "../db/schema.js";
import { lamportsToSol, baseUnitsToTokens } from "../domain/math.js";
import { replayQueue } from "../domain/queue.js";
import { rowFloor, rowPrice } from "../domain/reducer.js";
import type { ReadStore } from "../repo/types.js";
import {
  candleJson,
  coinJson,
  downsampleSnapshots,
  holderJson,
  queueEventJson,
  snapshotJson,
  tradeJson,
  valueAt,
  type SerializeCtx,
} from "./serialize.js";

const PUBKEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIG = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
const pubkey = z.string().regex(PUBKEY, "invalid base58 address");
const limit = (def: number, max: number) => z.coerce.number().int().min(1).max(max).default(def);

/** Accepts unix seconds, unix ms, or an ISO date. */
const time = z
  .string()
  .transform((s, ctx) => {
    const n = Number(s);
    const d = Number.isFinite(n) && s.trim() !== "" ? new Date(n < 1e12 ? n * 1000 : n) : new Date(s);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "invalid time" });
      return z.NEVER;
    }
    return d;
  })
  .optional();

const CoinsQuery = z.object({
  sort: z.enum(["new", "graduating", "floor", "volume"]).default("new"),
  phase: z.enum(["curve", "graduated"]).optional(),
  limit: limit(50, 100),
  cursor: z.string().max(512).optional(),
});
const TradesQuery = z.object({ limit: limit(50, 200), before: z.string().max(100).optional() });
const FloorQuery = z.object({ from: time, to: time, interval: z.enum(["1m", "5m", "15m", "1h", "4h", "1d"]).default("1m") });
const CandlesQuery = z.object({ interval: z.enum(["1m", "5m", "1h"]).default("1m"), from: time, to: time });
const HoldersQuery = z.object({ limit: limit(50, 500) });

const FLOOR_INTERVAL_SECONDS: Record<string, number> = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14_400, "1d": 86_400 };
const CANDLE_DEFAULT_SPAN: Record<CandleInterval, number> = { "1m": 86_400_000, "5m": 7 * 86_400_000, "1h": 30 * 86_400_000 };

function bad(c: Context, error: z.ZodError | string) {
  const message = typeof error === "string" ? error : error.issues.map((i) => `${i.path.join(".") || "query"}: ${i.message}`).join("; ");
  return c.json({ error: "bad_request", message }, 400);
}

export function readRoutes(store: ReadStore, opts: { slotMs: number; now?: () => Date }): Hono {
  const api = new Hono();
  const ctx = (): SerializeCtx => ({ now: opts.now?.() ?? new Date(), slotMs: opts.slotMs });

  const mintParam = (c: Context): string | null => {
    const m = c.req.param("mint") ?? "";
    return PUBKEY.test(m) ? m : null;
  };

  api.get("/coins", async (c) => {
    const q = CoinsQuery.safeParse(c.req.query());
    if (!q.success) return bad(c, q.error);
    const { rows, nextCursor } = await store.listCoins(q.data);
    const s = ctx();
    return c.json({ items: rows.map((r) => coinJson(r, s)), next_cursor: nextCursor });
  });

  api.get("/coins/:mint", async (c) => {
    const mint = mintParam(c);
    if (!mint) return bad(c, "invalid mint");
    const row = await store.getCoin(mint);
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(coinJson(row, ctx()));
  });

  api.get("/coins/:mint/trades", async (c) => {
    const mint = mintParam(c);
    if (!mint) return bad(c, "invalid mint");
    const q = TradesQuery.safeParse(c.req.query());
    if (!q.success) return bad(c, q.error);
    let before: number | undefined;
    if (q.data.before !== undefined) {
      if (/^\d+$/.test(q.data.before)) before = Number(q.data.before);
      else if (SIG.test(q.data.before)) before = (await store.findTradeSlot(q.data.before)) ?? undefined;
      else return bad(c, "before: expected a slot or a signature");
    }
    const rows = await store.listTrades(mint, q.data.limit, before);
    const last = rows[rows.length - 1];
    return c.json({ items: rows.map(tradeJson), next_before: rows.length === q.data.limit && last ? String(last.slot) : null });
  });

  api.get("/coins/:mint/floor", async (c) => {
    const mint = mintParam(c);
    if (!mint) return bad(c, "invalid mint");
    const q = FloorQuery.safeParse(c.req.query());
    if (!q.success) return bad(c, q.error);
    const to = q.data.to ?? new Date();
    const from = q.data.from ?? new Date(to.getTime() - 86_400_000);
    if (to.getTime() - from.getTime() > 31 * 86_400_000) return bad(c, "range too large (max 31 days)");
    const seconds = FLOOR_INTERVAL_SECONDS[q.data.interval]!;
    const rows = await store.listFloorSnapshots(mint, from, to, seconds);
    return c.json({ interval: q.data.interval, from: from.toISOString(), to: to.toISOString(), items: downsampleSnapshots(rows, seconds).map(snapshotJson) });
  });

  api.get("/coins/:mint/candles", async (c) => {
    const mint = mintParam(c);
    if (!mint) return bad(c, "invalid mint");
    const q = CandlesQuery.safeParse(c.req.query());
    if (!q.success) return bad(c, q.error);
    const to = q.data.to ?? new Date();
    const from = q.data.from ?? new Date(to.getTime() - CANDLE_DEFAULT_SPAN[q.data.interval]);
    const rows = await store.listCandles(mint, q.data.interval, from, to);
    return c.json({ interval: q.data.interval, unit: "SOL per token", items: rows.map(candleJson) });
  });

  api.get("/coins/:mint/queue", async (c) => {
    const mint = mintParam(c);
    if (!mint) return bad(c, "invalid mint");
    const row = await store.getCoin(mint);
    if (!row) return c.json({ error: "not_found" }, 404);
    const [recent, episode] = await Promise.all([store.listQueueEvents(mint, 50), row.queued > 0n ? store.listQueueEpisode(mint) : Promise.resolve([])]);
    const wallets = replayQueue(episode).map((w) => ({
      user: w.user,
      queued_estimate: w.queued_estimate.toString(),
      queued_estimate_display: baseUnitsToTokens(w.queued_estimate),
      joined_total: w.joined_total.toString(),
      last_slot: w.last_slot,
    }));
    return c.json({
      brake: coinJson(row, ctx()).brake,
      entries: wallets,
      entries_note: "Per-wallet remainders are pro-rata estimates rebuilt from queue events; the exact value is the on-chain QueueEntry (shares x scale).",
      recent: recent.map(queueEventJson),
    });
  });

  api.get("/coins/:mint/holders", async (c) => {
    const mint = mintParam(c);
    if (!mint) return bad(c, "invalid mint");
    const q = HoldersQuery.safeParse(c.req.query());
    if (!q.success) return bad(c, q.error);
    const [row, rows] = await Promise.all([store.getCoin(mint), store.listHolders(mint, q.data.limit)]);
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({
      holders_count: row.holders_count,
      refreshed: rows.length > 0,
      items: rows.map((h) => holderJson(h, row.supply, row.circulating)),
    });
  });

  api.get("/stats", async (c) => {
    const [g, series] = await Promise.all([store.getGlobalStats(), store.redeemedByDay(90)]);
    return c.json({
      sol_redeemed_total: (g?.sol_redeemed_total ?? 0n).toString(),
      sol_redeemed_total_display: lamportsToSol(g?.sol_redeemed_total ?? 0n),
      coins_created: g?.coins_created ?? 0,
      coins_graduated: g?.coins_graduated ?? 0,
      brake_engagements_total: g?.brake_engagements_total ?? 0,
      rugs_avoided: g?.rugs_avoided ?? 0,
      updated_at: g?.updated_at.toISOString() ?? null,
      sol_redeemed_by_day: series.map((d) => ({ day: d.day, sol_out: d.sol_out.toString(), sol_out_display: lamportsToSol(d.sol_out), count: d.count })),
    });
  });

  api.get("/portfolio/:owner", async (c) => {
    const owner = pubkey.safeParse(c.req.param("owner"));
    if (!owner.success) return bad(c, owner.error);
    const [tradeAgg, redeemAgg, returns, holdings] = await Promise.all([
      store.portfolioTrades(owner.data),
      store.portfolioRedeems(owner.data),
      store.portfolioQueueReturns(owner.data),
      store.portfolioHoldings(owner.data),
    ]);
    const mints = [...new Set([...tradeAgg.map((t) => t.mint), ...holdings.map((h) => h.mint), ...redeemAgg.map((r) => r.mint)])];
    const coinRows = new Map((await store.getCoins(mints)).map((r) => [r.mint, r]));
    const s = ctx();
    let totalPrice = 0n;
    let totalFloor = 0n;
    const items = mints.flatMap((mint) => {
      const coin = coinRows.get(mint);
      if (!coin) return [];
      const t = tradeAgg.find((x) => x.mint === mint);
      const r = redeemAgg.find((x) => x.mint === mint);
      const h = holdings.find((x) => x.mint === mint);
      const estimate = (t?.bought ?? 0n) - (t?.sold ?? 0n) - (t?.queued ?? 0n) + (returns.get(mint) ?? 0n) - (r?.tokens_burned ?? 0n);
      const balance = h ? h.balance : estimate > 0n ? estimate : 0n;
      const atPrice = valueAt(balance, rowPrice(coin));
      const atFloor = valueAt(balance, rowFloor(coin));
      totalPrice += atPrice;
      totalFloor += atFloor;
      const cj = coinJson(coin, s);
      return [
        {
          mint,
          name: coin.name,
          symbol: coin.symbol,
          image_url: coin.image_url,
          phase: coin.phase,
          balance: balance.toString(),
          balance_display: baseUnitsToTokens(balance),
          balance_source: h ? "holders" : "trades_estimate",
          price: cj.price,
          floor: cj.floor,
          floor_preview: cj.floor_preview,
          floor_active: cj.floor_active,
          value_at_price: atPrice.toString(),
          value_at_price_display: lamportsToSol(atPrice),
          value_at_floor: atFloor.toString(),
          value_at_floor_display: lamportsToSol(atFloor),
          trades: t?.trades ?? 0,
          sol_spent: (t?.sol_spent ?? 0n).toString(),
          sol_received: (t?.sol_received ?? 0n).toString(),
          sol_redeemed: (r?.sol_out ?? 0n).toString(),
          last_trade_at: t?.last_ts?.toISOString() ?? null,
        },
      ];
    });
    return c.json({
      owner: owner.data,
      items,
      total_value_at_price: totalPrice.toString(),
      total_value_at_price_display: lamportsToSol(totalPrice),
      total_value_at_floor: totalFloor.toString(),
      total_value_at_floor_display: lamportsToSol(totalFloor),
      note: "Balances come from the holders refresher when available; otherwise they are estimated from this wallet's trades, queue and redeems (transfers are not seen).",
    });
  });

  return api;
}
