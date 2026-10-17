/** Decoded on-chain shapes. Every u64/u128/i64 is a bigint. */

export interface CoinParams {
  virtual_sol: bigint;
  virtual_tok: bigint;
  curve_supply: bigint;
  graduation_sol: bigint;
  curve_fee_bps: number;
  curve_fee_creator_share_bps: number;
  curve_fee_protocol_share_bps: number;
  pool_fee_bps: number;
  pool_fee_pool_share_bps: number;
  pool_fee_creator_share_bps: number;
  redeem_fee_bps: number;
  brake_drop_bps: number;
  brake_window_slots: bigint;
}

export interface CoinCreatedEvent {
  mint: string;
  coin: string;
  creator: string;
  name: string;
  symbol: string;
  uri: string;
  params: CoinParams;
  /** Mint supply after creation (base units). */
  supply: bigint;
  slot: bigint;
  timestamp: bigint;
}

export interface TradeEvent {
  mint: string;
  user: string;
  is_buy: boolean;
  /** 0 = curve, 1 = pool. */
  phase: number;
  is_queue_fill: boolean;
  sol_amount: bigint;
  token_amount: bigint;
  fee_total: bigint;
  fee_to_floor: bigint;
  sol_reserves: bigint;
  token_reserves: bigint;
  real_sol: bigint;
  tokens_sold: bigint;
  floor_reserve: bigint;
  pool_sol: bigint;
  pool_tok: bigint;
  queued: bigint;
  supply: bigint;
  queued_remainder: bigint;
  slot: bigint;
  timestamp: bigint;
}

export interface GraduatedEvent {
  mint: string;
  caller: string;
  pool_sol: bigint;
  pool_tok: bigint;
  floor_reserve_added: bigint;
  tokens_sold: bigint;
  supply: bigint;
  slot: bigint;
  timestamp: bigint;
}

export interface RedeemedEvent {
  mint: string;
  user: string;
  tokens_burned: bigint;
  pool_tokens_burned: bigint;
  sol_out: bigint;
  fee_kept: bigint;
  pool_sol_after: bigint;
  pool_tok_after: bigint;
  supply_after: bigint;
  circulating_after: bigint;
  /** Queue size after the redeem. */
  queued: bigint;
  from_queue: boolean;
  slot: bigint;
  timestamp: bigint;
}

export interface BrakeEngagedEvent {
  mint: string;
  window_start: bigint;
  ref_sol: bigint;
  ref_tok: bigint;
  queued_total: bigint;
  epoch: number;
  slot: bigint;
  timestamp: bigint;
}

export interface BrakeReleasedEvent {
  mint: string;
  epoch: number;
  /** 0 = queue fully served by a window fill (epoch closed), 1 = last position cancelled or switched to the floor (epoch stays). */
  reason: number;
  slot: bigint;
  timestamp: bigint;
}

export interface QueueJoinedEvent {
  mint: string;
  user: string;
  amount: bigint;
  queued_total: bigint;
  epoch: number;
  slot: bigint;
  timestamp: bigint;
}

export interface QueueProcessedEvent {
  mint: string;
  caller: string;
  epoch: number;
  window_start: bigint;
  sold: bigint;
  sol_out: bigint;
  queued_after: bigint;
  closed_epoch: boolean;
  crank_reward: bigint;
  slot: bigint;
  timestamp: bigint;
}

export interface QueueSettledEvent {
  mint: string;
  user: string;
  /** 0 = claim, 1 = cancel, 2 = redeem at the floor. */
  kind: number;
  tokens_returned: bigint;
  tokens_redeemed: bigint;
  sol_paid: bigint;
  /** Queue size after the settlement. */
  queued_after: bigint;
  /** Coin's current queue epoch. */
  epoch: number;
  slot: bigint;
  timestamp: bigint;
}

export interface FeesClaimedEvent {
  mint: string;
  /** 0 = creator, 1 = protocol. */
  kind: number;
  recipient: string;
  amount: bigint;
  slot: bigint;
  timestamp: bigint;
}

export type FlooredEvent =
  | { name: "CoinCreated"; data: CoinCreatedEvent }
  | { name: "Trade"; data: TradeEvent }
  | { name: "Graduated"; data: GraduatedEvent }
  | { name: "Redeemed"; data: RedeemedEvent }
  | { name: "BrakeEngaged"; data: BrakeEngagedEvent }
  | { name: "BrakeReleased"; data: BrakeReleasedEvent }
  | { name: "QueueJoined"; data: QueueJoinedEvent }
  | { name: "QueueProcessed"; data: QueueProcessedEvent }
  | { name: "QueueSettled"; data: QueueSettledEvent }
  | { name: "FeesClaimed"; data: FeesClaimedEvent };

export interface BrakeState {
  ref_sol: bigint;
  ref_tok: bigint;
  window_start: bigint;
  epoch: number;
  scale: bigint;
  sol_index: bigint;
  queued_total: bigint;
  engagements: number;
  windows_processed: number;
}

export interface CoinStateAccount {
  mint: string;
  creator: string;
  params: CoinParams;
  phase: number;
  real_sol: bigint;
  tokens_sold: bigint;
  floor_reserve: bigint;
  pool_sol: bigint;
  pool_tok: bigint;
  creator_fees_owed: bigint;
  protocol_fees_owed: bigint;
  creator_fees_claimed: bigint;
  protocol_fees_claimed: bigint;
  total_redeemed_sol: bigint;
  redeem_count: bigint;
  total_pool_burned: bigint;
  buy_count: bigint;
  sell_count: bigint;
  volume_sol: bigint;
  brake: BrakeState;
  created_slot: bigint;
  graduated_slot: bigint;
  vault_rent: bigint;
  bumps: Record<string, number>;
  reserved: Uint8Array;
}
