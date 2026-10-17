/**
 * Indexer API types (apps/indexer/src/api). Every amount arrives twice: the
 * exact integer string (lamports / base units) and a lossy `_display` number.
 * The web app only computes with the exact strings (through @floored/sdk).
 */

export type Phase = "curve" | "graduated";
export type SortKey = "new" | "graduating" | "floor" | "volume";

export interface PriceJson {
  sol_per_token: string;
  lamports_per_token: string;
  lamports_per_base_unit: string;
  display: number;
}

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

export interface BrakeWindowJson {
  window_slots: number;
  est_current_slot: number;
  current_window_start: number;
  next_window_start: number;
  slots_remaining: number;
  eta_seconds: number;
  eta_ts: string;
}

export interface BrakeJson {
  engaged: boolean;
  epoch: number;
  engagements: number;
  drop_bps: number;
  window_slots: number;
  window_start: number | null;
  ref_price: PriceJson | null;
  queued: string;
  queued_display: number;
  window: BrakeWindowJson | null;
}

export interface CoinJson {
  mint: string;
  coin: string;
  creator: string;
  name: string;
  symbol: string;
  uri: string;
  image_url: string | null;
  description: string | null;
  params: CoinParamsJson | null;
  phase: Phase;
  created_slot: number | null;
  created_at: string | null;
  graduated_slot: number | null;
  graduated_at: string | null;
  real_sol: string;
  real_sol_display: number;
  floor_reserve: string;
  floor_reserve_display: number;
  pool_sol: string;
  pool_sol_display: number;
  tokens_sold: string;
  tokens_sold_display: number;
  pool_tok: string;
  pool_tok_display: number;
  queued: string;
  queued_display: number;
  supply: string;
  supply_display: number;
  circulating: string;
  circulating_display: number;
  sol_reserves: string;
  sol_reserves_display: number;
  token_reserves: string;
  token_reserves_display: number;
  mcap_sol: string;
  mcap_sol_display: number;
  volume_sol: string;
  volume_sol_display: number;
  total_redeemed_sol: string;
  total_redeemed_sol_display: number;
  price: PriceJson | null;
  floor: PriceJson | null;
  floor_active: boolean;
  floor_preview: PriceJson | null;
  /** 1 − floor / price, in bps. */
  gap_bps: number | null;
  graduation_progress_bps: number | null;
  holders_count: number | null;
  redeem_count: number;
  buy_count: number;
  sell_count: number;
  brake: BrakeJson;
  last_trade_at: string | null;
  last_event_slot: number;
  updated_at: string;
  /** Optional socials parsed from the metadata JSON (mock mode; future indexer versions). */
  socials?: { website?: string; x?: string; telegram?: string } | null;
  /** 24 h volume in lamports, when provided. */
  volume_24h_sol?: string;
}

export interface CoinListJson {
  items: CoinJson[];
  next_cursor: string | null;
}

export interface TradeJson {
  signature: string;
  event_index: number;
  user: string;
  side: "buy" | "sell";
  phase: Phase | number;
  is_queue_fill: boolean;
  sol_amount: string;
  sol_amount_display: number;
  token_amount: string;
  token_amount_display: number;
  fee_total: string;
  fee_total_display: number;
  fee_to_floor: string;
  fee_to_floor_display: number;
  queued_remainder: string;
  queued_remainder_display: number;
  price_after: string;
  price_after_display: number;
  floor_after: string;
  floor_after_display: number;
  slot: number;
  ts: string;
  /** Web-side extension: redeems are merged into the feed as their own kind. */
  kind?: "trade" | "redeem";
}

export interface TradeListJson {
  items: TradeJson[];
  next_before: string | null;
}

export interface CandleJson {
  bucket_ts: string;
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  floor_at_close: string;
  volume_sol: string;
  trades: number;
  display: {
    open: number;
    high: number;
    low: number;
    close: number;
    floor_at_close: number;
    volume_sol: number;
  };
}

export type CandleInterval = "1m" | "5m" | "1h";

export interface CandleListJson {
  interval: CandleInterval;
  unit: string;
  items: CandleJson[];
}

export interface SnapshotJson {
  minute: string;
  time: number;
  floor: string;
  floor_display: number;
  price: string;
  price_display: number;
  floor_active: boolean;
  pool_sol: string;
  pool_sol_display: number;
  pool_tok: string;
  pool_tok_display: number;
  circulating: string;
  circulating_display: number;
}

export interface SnapshotListJson {
  interval: string;
  from: string;
  to: string;
  items: SnapshotJson[];
}

export type QueueEventKind = "joined" | "processed" | "settled" | "engaged" | "released";

export interface QueueEventJson {
  signature: string;
  event_index: number;
  kind: QueueEventKind;
  user: string | null;
  epoch: number | null;
  amount: string | null;
  amount_display: number | null;
  queued_total: string | null;
  sol_amount: string | null;
  sol_amount_display: number | null;
  settle_kind: number | null;
  window_start: number | null;
  data: Record<string, unknown>;
  slot: number;
  ts: string;
}

export interface QueueJson {
  brake: BrakeJson;
  entries: {
    user: string;
    queued_estimate: string;
    queued_estimate_display: number;
    joined_total: string;
    last_slot: number;
  }[];
  entries_note: string;
  recent: QueueEventJson[];
}

export interface HolderJson {
  owner: string;
  balance: string;
  balance_display: number;
  share_of_supply_bps: number | null;
  share_of_circulating_bps: number | null;
  last_updated: string;
}

export interface HoldersJson {
  holders_count: number | null;
  refreshed: boolean;
  items: HolderJson[];
}

export interface StatsJson {
  sol_redeemed_total: string;
  sol_redeemed_total_display: number;
  coins_created: number;
  coins_graduated: number;
  brake_engagements_total: number;
  rugs_avoided: number;
  updated_at: string | null;
  sol_redeemed_by_day: { day: string; sol_out: string; sol_out_display: number; count: number }[];
  /** Not served by the indexer yet; mock mode fills it. */
  biggest_redeems?: { mint: string; symbol: string; user: string; sol_out: string; ts: string }[];
}

export interface PortfolioItemJson {
  mint: string;
  name: string;
  symbol: string;
  image_url: string | null;
  phase: Phase;
  balance: string;
  balance_display: number;
  balance_source: "holders" | "trades_estimate" | "chain";
  price: PriceJson | null;
  floor: PriceJson | null;
  floor_preview: PriceJson | null;
  floor_active: boolean;
  value_at_price: string;
  value_at_price_display: number;
  value_at_floor: string;
  value_at_floor_display: number;
  trades: number;
  sol_spent: string;
  sol_received: string;
  sol_redeemed: string;
  last_trade_at: string | null;
}

export interface PortfolioJson {
  owner: string;
  items: PortfolioItemJson[];
  total_value_at_price: string;
  total_value_at_price_display: number;
  total_value_at_floor: string;
  total_value_at_floor_display: number;
  note: string;
}

export type WsEventType =
  | "Trade"
  | "Redeemed"
  | "BrakeEngaged"
  | "BrakeReleased"
  | "QueueJoined"
  | "QueueProcessed"
  | "QueueSettled"
  | "CoinCreated"
  | "Graduated"
  | "FeesClaimed";

/** Websocket frame from the indexer hub: `{type, mint, signature, slot, ts, data}`. */
export interface WsMessage<T = Record<string, unknown>> {
  type: WsEventType;
  mint: string;
  signature: string;
  slot: number;
  ts: string;
  data: T;
}

/** Snake-case event payloads, as the indexer serializes them (bigint → decimal string). */
export interface WsTrade {
  mint: string;
  user: string;
  is_buy: boolean;
  phase: number;
  is_queue_fill: boolean;
  sol_amount: string;
  token_amount: string;
  fee_total: string;
  fee_to_floor: string;
  sol_reserves: string;
  token_reserves: string;
  real_sol: string;
  floor_reserve: string;
  pool_sol: string;
  pool_tok: string;
  queued: string;
  supply: string;
  queued_remainder: string;
  slot: string;
  timestamp: string;
}

export interface WsRedeemed {
  mint: string;
  user: string;
  tokens_burned: string;
  pool_tokens_burned: string;
  sol_out: string;
  fee_kept: string;
  pool_sol_after: string;
  pool_tok_after: string;
  supply_after: string;
  circulating_after: string;
  from_queue: boolean;
  slot: string;
  timestamp: string;
}

export interface WsBrakeEngaged {
  mint: string;
  window_start: string;
  ref_sol: string;
  ref_tok: string;
  queued_total: string;
  epoch: number;
  slot: string;
}

export interface WsQueueProcessed {
  mint: string;
  caller: string;
  epoch: number;
  window_start: string;
  sold: string;
  sol_out: string;
  queued_after: string;
  closed_epoch: boolean;
  crank_reward: string;
  slot: string;
}
