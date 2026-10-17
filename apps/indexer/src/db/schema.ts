/**
 * PostgreSQL schema. Conventions:
 *  - on-chain amounts (lamports, token base units) are `numeric(39,0)` mapped
 *    to JS bigint (`amount` below); never JS numbers.
 *  - `*_lamports_per_token` columns on `coins` are lamports per whole token
 *    (10^6 base units), decimal strings.
 *  - prices on trades / candles / floor_snapshots are SOL per token, decimal strings.
 *  - slots are int8 mapped to JS number (safe: < 2^53).
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** u64/u128 amount stored as numeric(39,0), surfaced as bigint. */
export const amount = customType<{ data: bigint; driverData: string }>({
  dataType() {
    return "numeric(39, 0)";
  },
  toDriver(v) {
    return v.toString();
  },
  fromDriver(v) {
    return BigInt(String(v));
  },
});

const slot = (name: string) => bigint(name, { mode: "number" });
const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const zero = sql`0`;

export type CoinPhase = "curve" | "graduated";

/** CoinParams with u64 fields as decimal strings (JSON-safe). */
export interface CoinParamsJson {
  virtual_sol: string;
  virtual_tok: string;
  curve_supply: string;
  graduation_sol: string;
  curve_fee_bps: number;
  curve_fee_creator_share_bps: number;
  curve_fee_protocol_share_bps: number;
  pool_fee_bps: number;
  pool_fee_pool_share_bps: number;
  pool_fee_creator_share_bps: number;
  redeem_fee_bps: number;
  brake_drop_bps: number;
  brake_window_slots: string;
}

export const coins = pgTable(
  "coins",
  {
    mint: text("mint").primaryKey(),
    coin: text("coin").notNull().default(""),
    creator: text("creator").notNull().default(""),
    name: text("name").notNull().default(""),
    symbol: text("symbol").notNull().default(""),
    uri: text("uri").notNull().default(""),
    image_url: text("image_url"),
    description: text("description"),
    params: jsonb("params").$type<CoinParamsJson>(),
    phase: text("phase").$type<CoinPhase>().notNull().default("curve"),
    created_slot: slot("created_slot"),
    created_ts: tstz("created_ts"),
    graduated_slot: slot("graduated_slot"),
    graduated_ts: tstz("graduated_ts"),
    real_sol: amount("real_sol").notNull().default(zero),
    tokens_sold: amount("tokens_sold").notNull().default(zero),
    floor_reserve: amount("floor_reserve").notNull().default(zero),
    pool_sol: amount("pool_sol").notNull().default(zero),
    pool_tok: amount("pool_tok").notNull().default(zero),
    queued: amount("queued").notNull().default(zero),
    supply: amount("supply").notNull().default(zero),
    /** Pricing reserves: virtual reserves on the curve, pool reserves after graduation. */
    sol_reserves: amount("sol_reserves").notNull().default(zero),
    token_reserves: amount("token_reserves").notNull().default(zero),
    circulating: amount("circulating").notNull().default(zero),
    /** Active floor after graduation, `floor_preview` before (see floor_active in the API). */
    floor_lamports_per_token: numeric("floor_lamports_per_token").notNull().default("0"),
    price_lamports_per_token: numeric("price_lamports_per_token").notNull().default("0"),
    mcap_sol: amount("mcap_sol").notNull().default(zero),
    holders_count: integer("holders_count").notNull().default(0),
    total_redeemed_sol: amount("total_redeemed_sol").notNull().default(zero),
    redeem_count: integer("redeem_count").notNull().default(0),
    buy_count: integer("buy_count").notNull().default(0),
    sell_count: integer("sell_count").notNull().default(0),
    volume_sol: amount("volume_sol").notNull().default(zero),
    brake_engaged: boolean("brake_engaged").notNull().default(false),
    brake_window_start: slot("brake_window_start"),
    brake_epoch: integer("brake_epoch").notNull().default(0),
    brake_engagements: integer("brake_engagements").notNull().default(0),
    brake_ref_sol: amount("brake_ref_sol").notNull().default(zero),
    brake_ref_tok: amount("brake_ref_tok").notNull().default(zero),
    last_trade_ts: tstz("last_trade_ts"),
    /** Slot of the latest event projected into the state fields (monotonic). */
    last_event_slot: slot("last_event_slot").notNull().default(0),
    last_event_ts: tstz("last_event_ts"),
    updated_at: tstz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("coins_created_slot_idx").on(t.created_slot),
    index("coins_phase_real_sol_idx").on(t.phase, t.real_sol),
    index("coins_volume_idx").on(t.volume_sol),
    index("coins_floor_idx").on(t.floor_lamports_per_token),
    index("coins_creator_idx").on(t.creator),
  ],
);

export const trades = pgTable(
  "trades",
  {
    signature: text("signature").notNull(),
    /** Ordinal of the event inside the transaction (one instruction can emit a queue fill and a user trade). */
    event_index: integer("event_index").notNull(),
    /** Top-level instruction index the event was emitted from. */
    ix_index: integer("ix_index").notNull(),
    mint: text("mint").notNull(),
    user: text("user").notNull(),
    side: text("side").$type<"buy" | "sell">().notNull(),
    phase: text("phase").$type<CoinPhase>().notNull(),
    is_queue_fill: boolean("is_queue_fill").notNull(),
    sol_amount: amount("sol_amount").notNull(),
    token_amount: amount("token_amount").notNull(),
    fee_total: amount("fee_total").notNull(),
    fee_to_floor: amount("fee_to_floor").notNull(),
    /** SOL per token. */
    price_after: numeric("price_after").notNull(),
    /** SOL per token (floor preview while on the curve). */
    floor_after: numeric("floor_after").notNull(),
    queued_remainder: amount("queued_remainder").notNull(),
    slot: slot("slot").notNull(),
    ts: tstz("ts").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.signature, t.event_index] }),
    index("trades_mint_slot_idx").on(t.mint, t.slot),
    index("trades_user_idx").on(t.user),
  ],
);

export const redeems = pgTable(
  "redeems",
  {
    signature: text("signature").notNull(),
    event_index: integer("event_index").notNull(),
    mint: text("mint").notNull(),
    user: text("user").notNull(),
    tokens_burned: amount("tokens_burned").notNull(),
    pool_tokens_burned: amount("pool_tokens_burned").notNull(),
    sol_out: amount("sol_out").notNull(),
    fee_kept: amount("fee_kept").notNull(),
    from_queue: boolean("from_queue").notNull(),
    slot: slot("slot").notNull(),
    ts: tstz("ts").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.signature, t.event_index] }),
    index("redeems_mint_slot_idx").on(t.mint, t.slot),
    index("redeems_user_idx").on(t.user),
    index("redeems_ts_idx").on(t.ts),
  ],
);

export type QueueEventKind = "joined" | "processed" | "settled" | "engaged" | "released";

export const queue_events = pgTable(
  "queue_events",
  {
    signature: text("signature").notNull(),
    event_index: integer("event_index").notNull(),
    mint: text("mint").notNull(),
    kind: text("kind").$type<QueueEventKind>().notNull(),
    /** Seller for joined/settled, cranker for processed, null for engaged/released. */
    user: text("user"),
    /** Queue epoch of the coin when the event was emitted (for processed/released: the epoch served). */
    epoch: integer("epoch"),
    /** joined: tokens added · processed: tokens sold · settled: tokens returned (cancel) or redeemed. */
    amount: amount("amount"),
    /** Queue size after the event (joined / engaged / processed / settled; 0 for released). */
    queued_total: amount("queued_total"),
    /** processed: SOL out of the aggregate swap · settled: SOL paid to the seller. */
    sol_amount: amount("sol_amount"),
    /** settled only: 0 claim, 1 cancel, 2 redeem. */
    settle_kind: smallint("settle_kind"),
    window_start: slot("window_start"),
    /** Full event payload, u64 as strings. */
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    slot: slot("slot").notNull(),
    ts: tstz("ts").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.signature, t.event_index] }),
    index("queue_events_mint_slot_idx").on(t.mint, t.slot),
    index("queue_events_kind_idx").on(t.kind),
  ],
);

export const floor_snapshots = pgTable(
  "floor_snapshots",
  {
    mint: text("mint").notNull(),
    /** Minute bucket (unique per coin). */
    minute: tstz("minute").notNull(),
    ts: tstz("ts").notNull(),
    /** SOL per token. */
    floor: numeric("floor").notNull(),
    /** SOL per token. */
    price: numeric("price").notNull(),
    pool_sol: amount("pool_sol").notNull(),
    pool_tok: amount("pool_tok").notNull(),
    circulating: amount("circulating").notNull(),
    floor_active: boolean("floor_active").notNull(),
  },
  (t) => [primaryKey({ columns: [t.mint, t.minute] })],
);

export const holders = pgTable(
  "holders",
  {
    mint: text("mint").notNull(),
    owner: text("owner").notNull(),
    balance: amount("balance").notNull(),
    last_updated: tstz("last_updated").notNull(),
  },
  (t) => [primaryKey({ columns: [t.mint, t.owner] }), index("holders_owner_idx").on(t.owner)],
);

export type CandleInterval = "1m" | "5m" | "1h";

export const candles = pgTable(
  "candles",
  {
    mint: text("mint").notNull(),
    interval: text("interval").$type<CandleInterval>().notNull(),
    bucket_ts: tstz("bucket_ts").notNull(),
    /** OHLC in SOL per token. */
    open: numeric("open").notNull(),
    high: numeric("high").notNull(),
    low: numeric("low").notNull(),
    close: numeric("close").notNull(),
    volume_sol: amount("volume_sol").notNull(),
    trades: integer("trades").notNull(),
    /** Floor (SOL per token) after the last trade of the bucket. */
    floor_at_close: numeric("floor_at_close").notNull(),
    open_slot: slot("open_slot").notNull(),
    close_slot: slot("close_slot").notNull(),
  },
  (t) => [primaryKey({ columns: [t.mint, t.interval, t.bucket_ts] })],
);

export const global_stats = pgTable("global_stats", {
  id: integer("id").primaryKey(),
  sol_redeemed_total: amount("sol_redeemed_total").notNull().default(zero),
  coins_created: integer("coins_created").notNull().default(0),
  coins_graduated: integer("coins_graduated").notNull().default(0),
  brake_engagements_total: integer("brake_engagements_total").notNull().default(0),
  rugs_avoided: integer("rugs_avoided").notNull().default(0),
  updated_at: tstz("updated_at").notNull().defaultNow(),
});

export const processed_signatures = pgTable("processed_signatures", {
  signature: text("signature").primaryKey(),
  slot: slot("slot").notNull(),
  processed_at: tstz("processed_at").notNull().defaultNow(),
});

export type CoinRow = typeof coins.$inferSelect;
export type TradeRow = typeof trades.$inferSelect;
export type RedeemRow = typeof redeems.$inferSelect;
export type QueueEventRow = typeof queue_events.$inferSelect;
export type FloorSnapshotRow = typeof floor_snapshots.$inferSelect;
export type HolderRow = typeof holders.$inferSelect;
export type CandleRow = typeof candles.$inferSelect;
export type GlobalStatsRow = typeof global_stats.$inferSelect;
