/**
 * PostgreSQL implementation of the stores (Drizzle + postgres-js).
 *
 * Concurrency: every per-coin write takes `pg_advisory_xact_lock(hashtext(mint))`
 * before reading the coin row, so two transactions touching the same coin are
 * serialized even across indexer instances (counters are read-modify-write).
 */
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, lte, sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.js";
import {
  candles,
  coins,
  floor_snapshots,
  global_stats,
  holders,
  processed_signatures,
  queue_events,
  redeems,
  trades,
  type CandleInterval,
  type CoinRow,
  type GlobalStatsRow,
} from "../db/schema.js";
import type {
  CoinSort,
  DailyRedeemed,
  IngestStore,
  IngestTx,
  ListCoinsQuery,
  MaintenanceStore,
  PortfolioRedeemAgg,
  PortfolioTradeAgg,
  ReadStore,
} from "./types.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function encodeCursor(v: string, m: string): string {
  return Buffer.from(JSON.stringify({ v, m })).toString("base64url");
}

export function decodeCursor(c: string): { v: string; m: string } | null {
  try {
    const o = JSON.parse(Buffer.from(c, "base64url").toString("utf8")) as unknown;
    if (o && typeof o === "object" && typeof (o as { v: unknown }).v === "string" && typeof (o as { m: unknown }).m === "string") {
      const { v, m } = o as { v: string; m: string };
      if (!/^-?\d+(\.\d+)?$/.test(v)) return null;
      return { v, m };
    }
  } catch {
    /* fallthrough */
  }
  return null;
}

function sortExpr(sort: CoinSort): SQL {
  switch (sort) {
    case "new":
      return sql`coalesce(${coins.created_slot}, 0)`;
    case "graduating":
      return sql`${coins.real_sol}`;
    case "floor":
      return sql`${coins.floor_lamports_per_token}`;
    case "volume":
      return sql`${coins.volume_sol}`;
  }
}

function sortValue(sort: CoinSort, r: CoinRow): string {
  switch (sort) {
    case "new":
      return String(r.created_slot ?? 0);
    case "graduating":
      return r.real_sol.toString();
    case "floor":
      return r.floor_lamports_per_token;
    case "volume":
      return r.volume_sol.toString();
  }
}

function makeTx(t: Tx): IngestTx {
  return {
    async isProcessed(signature) {
      const r = await t.select({ s: processed_signatures.signature }).from(processed_signatures).where(eq(processed_signatures.signature, signature)).limit(1);
      return r.length > 0;
    },
    async markProcessed(signature, slot) {
      await t.insert(processed_signatures).values({ signature, slot }).onConflictDoNothing();
    },
    async getCoinForUpdate(mint) {
      await t.execute(sql`select pg_advisory_xact_lock(hashtext(${mint}))`);
      const r = await t.select().from(coins).where(eq(coins.mint, mint)).for("update");
      return r[0] ?? null;
    },
    async saveCoin(row) {
      const { mint: _mint, ...rest } = row;
      await t.insert(coins).values(row).onConflictDoUpdate({ target: coins.mint, set: rest });
    },
    async insertTrade(row) {
      await t.insert(trades).values(row).onConflictDoNothing();
    },
    async insertRedeem(row) {
      await t.insert(redeems).values(row).onConflictDoNothing();
    },
    async insertQueueEvent(row) {
      await t.insert(queue_events).values(row).onConflictDoNothing();
    },
    async getCandleForUpdate(mint, interval, bucket) {
      const r = await t
        .select()
        .from(candles)
        .where(and(eq(candles.mint, mint), eq(candles.interval, interval), eq(candles.bucket_ts, bucket)))
        .for("update");
      return r[0] ?? null;
    },
    async saveCandle(row) {
      const { mint: _m, interval: _i, bucket_ts: _b, ...rest } = row;
      await t.insert(candles).values(row).onConflictDoUpdate({ target: [candles.mint, candles.interval, candles.bucket_ts], set: rest });
    },
    async saveFloorSnapshot(row) {
      const { mint: _m, minute: _mi, ...rest } = row;
      await t.insert(floor_snapshots).values(row).onConflictDoUpdate({ target: [floor_snapshots.mint, floor_snapshots.minute], set: rest });
    },
  };
}

export class DrizzleStore implements IngestStore, ReadStore, MaintenanceStore {
  constructor(private readonly db: Db) {}

  transaction<T>(fn: (tx: IngestTx) => Promise<T>): Promise<T> {
    return this.db.transaction((t) => fn(makeTx(t)));
  }

  // ───────────── read side ─────────────

  async ping(): Promise<boolean> {
    await this.db.execute(sql`select 1`);
    return true;
  }

  async listCoins(q: ListCoinsQuery): Promise<{ rows: CoinRow[]; nextCursor: string | null }> {
    const expr = sortExpr(q.sort);
    const conds: SQL[] = [];
    const phase = q.sort === "graduating" ? "curve" : q.phase;
    if (phase) conds.push(eq(coins.phase, phase));
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (c) conds.push(sql`(${expr}, ${coins.mint}) < (${c.v}::numeric, ${c.m})`);
    }
    const rows = await this.db
      .select()
      .from(coins)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(expr), desc(coins.mint))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return { rows: page, nextCursor: rows.length > q.limit && last ? encodeCursor(sortValue(q.sort, last), last.mint) : null };
  }

  async getCoin(mint: string) {
    const r = await this.db.select().from(coins).where(eq(coins.mint, mint)).limit(1);
    return r[0] ?? null;
  }

  async getCoins(mints: string[]) {
    if (!mints.length) return [];
    return this.db.select().from(coins).where(inArray(coins.mint, mints));
  }

  async listTrades(mint: string, limit: number, beforeSlot?: number) {
    return this.db
      .select()
      .from(trades)
      .where(and(eq(trades.mint, mint), beforeSlot !== undefined ? lt(trades.slot, beforeSlot) : undefined))
      .orderBy(desc(trades.slot), desc(trades.event_index))
      .limit(limit);
  }

  async findTradeSlot(signature: string): Promise<number | null> {
    const r = await this.db.select({ slot: trades.slot }).from(trades).where(eq(trades.signature, signature)).limit(1);
    return r[0]?.slot ?? null;
  }

  async listFloorSnapshots(mint: string, from: Date, to: Date, _intervalSeconds: number) {
    return this.db
      .select()
      .from(floor_snapshots)
      .where(and(eq(floor_snapshots.mint, mint), gte(floor_snapshots.minute, from), lte(floor_snapshots.minute, to)))
      .orderBy(asc(floor_snapshots.minute))
      .limit(50_000);
  }

  async listCandles(mint: string, interval: CandleInterval, from: Date, to: Date) {
    return this.db
      .select()
      .from(candles)
      .where(and(eq(candles.mint, mint), eq(candles.interval, interval), gte(candles.bucket_ts, from), lte(candles.bucket_ts, to)))
      .orderBy(asc(candles.bucket_ts))
      .limit(5_000);
  }

  async listQueueEvents(mint: string, limit: number) {
    return this.db.select().from(queue_events).where(eq(queue_events.mint, mint)).orderBy(desc(queue_events.slot), desc(queue_events.event_index)).limit(limit);
  }

  async listQueueEpisode(mint: string) {
    const since = sql`coalesce((select max(${queue_events.slot}) from ${queue_events} where ${queue_events.mint} = ${mint} and ${queue_events.kind} = 'released'), 0)`;
    return this.db
      .select()
      .from(queue_events)
      .where(and(eq(queue_events.mint, mint), sql`${queue_events.slot} >= ${since}`))
      .orderBy(asc(queue_events.slot), asc(queue_events.event_index))
      .limit(5_000);
  }

  async listHolders(mint: string, limit: number) {
    return this.db.select().from(holders).where(eq(holders.mint, mint)).orderBy(desc(holders.balance)).limit(limit);
  }

  async getGlobalStats() {
    const r = await this.db.select().from(global_stats).where(eq(global_stats.id, 1)).limit(1);
    return r[0] ?? null;
  }

  async redeemedByDay(days: number): Promise<DailyRedeemed[]> {
    const day = sql<string>`to_char(date_trunc('day', ${redeems.ts} at time zone 'UTC'), 'YYYY-MM-DD')`;
    const rows = await this.db
      .select({ day, sol_out: sql<string>`coalesce(sum(${redeems.sol_out}), 0)::text`, count: sql<number>`count(*)::int` })
      .from(redeems)
      .where(gte(redeems.ts, new Date(Date.now() - days * 86_400_000)))
      .groupBy(day)
      .orderBy(day);
    return rows.map((r) => ({ day: r.day, sol_out: BigInt(r.sol_out), count: Number(r.count) }));
  }

  async portfolioTrades(owner: string): Promise<PortfolioTradeAgg[]> {
    const sum = (e: SQL) => sql<string>`coalesce(sum(${e}), 0)::text`;
    const rows = await this.db
      .select({
        mint: trades.mint,
        bought: sum(sql`case when ${trades.side} = 'buy' then ${trades.token_amount} else 0 end`),
        sold: sum(sql`case when ${trades.side} = 'sell' then ${trades.token_amount} else 0 end`),
        queued: sum(sql`${trades.queued_remainder}`),
        sol_spent: sum(sql`case when ${trades.side} = 'buy' then ${trades.sol_amount} else 0 end`),
        sol_received: sum(sql`case when ${trades.side} = 'sell' then ${trades.sol_amount} else 0 end`),
        trades: sql<number>`count(*)::int`,
        last_ts: sql<string | null>`max(${trades.ts})::text`,
      })
      .from(trades)
      .where(eq(trades.user, owner))
      .groupBy(trades.mint);
    return rows.map((r) => ({
      mint: r.mint,
      bought: BigInt(r.bought),
      sold: BigInt(r.sold),
      queued: BigInt(r.queued),
      sol_spent: BigInt(r.sol_spent),
      sol_received: BigInt(r.sol_received),
      trades: Number(r.trades),
      last_ts: r.last_ts ? new Date(r.last_ts) : null,
    }));
  }

  async portfolioRedeems(owner: string): Promise<PortfolioRedeemAgg[]> {
    const rows = await this.db
      .select({
        mint: redeems.mint,
        // Redeems from the queue burn escrowed tokens, already counted in queued_remainder.
        tokens_burned: sql<string>`coalesce(sum(case when ${redeems.from_queue} then 0 else ${redeems.tokens_burned} end), 0)::text`,
        sol_out: sql<string>`coalesce(sum(${redeems.sol_out}), 0)::text`,
      })
      .from(redeems)
      .where(eq(redeems.user, owner))
      .groupBy(redeems.mint);
    return rows.map((r) => ({ mint: r.mint, tokens_burned: BigInt(r.tokens_burned), sol_out: BigInt(r.sol_out) }));
  }

  async portfolioQueueReturns(owner: string): Promise<Map<string, bigint>> {
    const rows = await this.db
      .select({ mint: queue_events.mint, returned: sql<string>`coalesce(sum(${queue_events.amount}), 0)::text` })
      .from(queue_events)
      .where(and(eq(queue_events.user, owner), eq(queue_events.kind, "settled"), eq(queue_events.settle_kind, 1)))
      .groupBy(queue_events.mint);
    return new Map(rows.map((r) => [r.mint, BigInt(r.returned)]));
  }

  async portfolioHoldings(owner: string) {
    return this.db.select().from(holders).where(eq(holders.owner, owner));
  }

  // ───────────── maintenance ─────────────

  async recomputeGlobalStats(): Promise<GlobalStatsRow> {
    await this.db.execute(sql`
      insert into global_stats (id, sol_redeemed_total, coins_created, coins_graduated, brake_engagements_total, rugs_avoided, updated_at)
      select 1,
        (select coalesce(sum(sol_out), 0) from redeems),
        (select count(*) from coins where created_slot is not null),
        (select count(*) from coins where phase = 'graduated'),
        (select count(*) from queue_events where kind = 'engaged'),
        -- rugs avoided: brake episodes (BrakeEngaged → next BrakeReleased of the same coin)
        -- whose peak queued amount reached 10 % of the coin's supply.
        (select count(*) from queue_events e join coins c on c.mint = e.mint
          where e.kind = 'engaged' and c.supply > 0
            and 10 * (
              select max(q.queued_total) from queue_events q
              where q.mint = e.mint and q.kind in ('engaged', 'joined') and q.slot >= e.slot
                and q.slot <= coalesce(
                  (select min(r.slot) from queue_events r where r.mint = e.mint and r.kind = 'released' and r.slot >= e.slot),
                  9223372036854775807)
            ) >= c.supply),
        now()
      on conflict (id) do update set
        sol_redeemed_total = excluded.sol_redeemed_total,
        coins_created = excluded.coins_created,
        coins_graduated = excluded.coins_graduated,
        brake_engagements_total = excluded.brake_engagements_total,
        rugs_avoided = excluded.rugs_avoided,
        updated_at = excluded.updated_at`);
    const r = await this.getGlobalStats();
    if (!r) throw new Error("global_stats row missing after upsert");
    return r;
  }

  async snapshotActiveCoins(now: Date): Promise<number> {
    // Raw SQL: postgres-js wants strings, not Date, for untyped parameters.
    const iso = now.toISOString();
    const res = await this.db.execute(sql`
      insert into floor_snapshots (mint, minute, ts, floor, price, pool_sol, pool_tok, circulating, floor_active)
      select mint, date_trunc('minute', ${iso}::timestamptz), ${iso}::timestamptz,
        round(floor_lamports_per_token / 1000000000, 18),
        round(price_lamports_per_token / 1000000000, 18),
        pool_sol, pool_tok, circulating, phase = 'graduated'
      from coins
      where phase = 'graduated' or last_trade_ts > ${iso}::timestamptz - interval '24 hours'
      on conflict (mint, minute) do update set
        ts = excluded.ts, floor = excluded.floor, price = excluded.price, pool_sol = excluded.pool_sol,
        pool_tok = excluded.pool_tok, circulating = excluded.circulating, floor_active = excluded.floor_active`);
    return (res as unknown as { count?: number }).count ?? 0;
  }

  async replaceHolders(mint: string, rows: { owner: string; balance: bigint }[], now: Date): Promise<void> {
    await this.db.transaction(async (t) => {
      await t.delete(holders).where(eq(holders.mint, mint));
      const positive = rows.filter((r) => r.balance > 0n);
      for (let i = 0; i < positive.length; i += 1000) {
        await t.insert(holders).values(positive.slice(i, i + 1000).map((r) => ({ mint, owner: r.owner, balance: r.balance, last_updated: now })));
      }
      await t.update(coins).set({ holders_count: positive.length }).where(eq(coins.mint, mint));
    });
  }

  async setCoinMetadata(mint: string, meta: { image_url: string | null; description: string | null }): Promise<void> {
    await this.db.update(coins).set(meta).where(eq(coins.mint, mint));
  }

  async listMintsForHolderRefresh(limit: number) {
    return this.db
      .select({ mint: coins.mint, coin: coins.coin })
      .from(coins)
      .where(isNotNull(coins.created_slot))
      .orderBy(sql`${coins.last_trade_ts} desc nulls last`)
      .limit(limit);
  }
}
