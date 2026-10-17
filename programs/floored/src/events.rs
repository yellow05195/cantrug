//! Events, emitted as `Program data:` logs (Anchor `emit!`). Field names stay
//! close to Pump's `TradeEvent` so existing indexers (GMGN, Axiom,
//! Dexscreener, Photon) can map them with little effort.

use crate::state::CoinParams;
use anchor_lang::prelude::*;

#[event]
pub struct CoinCreated {
    pub mint: Pubkey,
    pub coin: Pubkey,
    pub creator: Pubkey,
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub params: CoinParams,
    pub supply: u64,
    pub slot: u64,
    pub timestamp: i64,
}

/// One executed trade (direct, or an aggregate queue fill when `is_queue_fill`).
#[event]
pub struct Trade {
    pub mint: Pubkey,
    pub user: Pubkey,
    pub is_buy: bool,
    /// 0 = curve, 1 = pool.
    pub phase: u8,
    pub is_queue_fill: bool,
    /// SOL the user paid (buy, fee included) or received (sell, fee deducted).
    pub sol_amount: u64,
    pub token_amount: u64,
    pub fee_total: u64,
    /// Part of the fee that stays with the holders (floor reserve on the curve, pool SOL after).
    pub fee_to_floor: u64,
    /// Pricing reserves after the trade: virtual reserves on the curve, pool reserves after.
    pub sol_reserves: u64,
    pub token_reserves: u64,
    pub real_sol: u64,
    pub tokens_sold: u64,
    pub floor_reserve: u64,
    pub pool_sol: u64,
    pub pool_tok: u64,
    pub queued: u64,
    pub supply: u64,
    /// Tokens of this order that went to the brake queue instead of executing.
    pub queued_remainder: u64,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct Graduated {
    pub mint: Pubkey,
    pub caller: Pubkey,
    pub pool_sol: u64,
    pub pool_tok: u64,
    pub floor_reserve_added: u64,
    pub tokens_sold: u64,
    pub supply: u64,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct Redeemed {
    pub mint: Pubkey,
    pub user: Pubkey,
    pub tokens_burned: u64,
    pub pool_tokens_burned: u64,
    pub sol_out: u64,
    pub fee_kept: u64,
    pub pool_sol_after: u64,
    pub pool_tok_after: u64,
    pub supply_after: u64,
    pub circulating_after: u64,
    pub queued: u64,
    /// True when the tokens came from the sender's queue position.
    pub from_queue: bool,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct BrakeEngaged {
    pub mint: Pubkey,
    pub window_start: u64,
    pub ref_sol: u64,
    pub ref_tok: u64,
    pub queued_total: u64,
    pub epoch: u32,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct BrakeReleased {
    pub mint: Pubkey,
    pub epoch: u32,
    /// 0 = queue fully served by a window fill, 1 = last position cancelled or switched to the floor.
    pub reason: u8,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct QueueJoined {
    pub mint: Pubkey,
    pub user: Pubkey,
    pub amount: u64,
    pub queued_total: u64,
    pub epoch: u32,
    pub slot: u64,
    pub timestamp: i64,
}

#[event]
pub struct QueueProcessed {
    pub mint: Pubkey,
    pub caller: Pubkey,
    pub epoch: u32,
    pub window_start: u64,
    pub sold: u64,
    pub sol_out: u64,
    pub queued_after: u64,
    pub closed_epoch: bool,
    pub crank_reward: u64,
    pub slot: u64,
    pub timestamp: i64,
}

/// A seller settled their queue position: 0 = claim (keeps queuing), 1 = cancel, 2 = redeem at the floor.
#[event]
pub struct QueueSettled {
    pub mint: Pubkey,
    pub user: Pubkey,
    pub kind: u8,
    pub tokens_returned: u64,
    pub tokens_redeemed: u64,
    pub sol_paid: u64,
    /// Queue size after this settlement (0 means the brake released).
    pub queued_after: u64,
    pub epoch: u32,
    pub slot: u64,
    pub timestamp: i64,
}

/// 0 = creator, 1 = protocol.
#[event]
pub struct FeesClaimed {
    pub mint: Pubkey,
    pub kind: u8,
    pub recipient: Pubkey,
    pub amount: u64,
    pub slot: u64,
    pub timestamp: i64,
}
