//! Account layouts. Everything a holder needs to verify the floor is here, in
//! plain fields: `pool_sol` (also the lamport balance of `pool_sol_vault`
//! minus rent), `pool_tok` (also the balance of `pool_token_vault`), and
//! `brake.queued_total` (also the balance of `queue_escrow`).

use anchor_lang::prelude::*;
use floored_core as fc;

pub const SEED_CONFIG: &[u8] = b"config";
pub const SEED_COIN: &[u8] = b"coin";
pub const SEED_CURVE_VAULT: &[u8] = b"curve_sol";
pub const SEED_FLOOR_RESERVE: &[u8] = b"floor_reserve";
pub const SEED_POOL_SOL: &[u8] = b"pool_sol";
pub const SEED_FEE_VAULT: &[u8] = b"fees";
pub const SEED_QUEUE_SOL: &[u8] = b"queue_sol";
pub const SEED_CURVE_TOKENS: &[u8] = b"curve_tokens";
pub const SEED_POOL_TOKENS: &[u8] = b"pool_tokens";
pub const SEED_QUEUE_ESCROW: &[u8] = b"queue_escrow";
pub const SEED_QUEUE_ENTRY: &[u8] = b"queue";
pub const SEED_EPOCH: &[u8] = b"epoch";

pub const MAX_NAME: usize = 32;
pub const MAX_SYMBOL: usize = 10;
pub const MAX_URI: usize = 200;

/// Per-coin parameters, frozen at creation. Mirrors `floored_core::Params`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq, InitSpace)]
pub struct CoinParams {
    pub virtual_sol: u64,
    pub virtual_tok: u64,
    pub curve_supply: u64,
    pub graduation_sol: u64,
    pub curve_fee_bps: u16,
    pub curve_fee_creator_share_bps: u16,
    pub curve_fee_protocol_share_bps: u16,
    pub pool_fee_bps: u16,
    pub pool_fee_pool_share_bps: u16,
    pub pool_fee_creator_share_bps: u16,
    pub redeem_fee_bps: u16,
    pub brake_drop_bps: u16,
    pub brake_window_slots: u64,
}

impl CoinParams {
    pub fn to_core(self) -> fc::Params {
        fc::Params {
            virtual_sol: self.virtual_sol,
            virtual_tok: self.virtual_tok,
            curve_supply: self.curve_supply,
            graduation_sol: self.graduation_sol,
            curve_fee_bps: self.curve_fee_bps,
            curve_fee_creator_share_bps: self.curve_fee_creator_share_bps,
            curve_fee_protocol_share_bps: self.curve_fee_protocol_share_bps,
            pool_fee_bps: self.pool_fee_bps,
            pool_fee_pool_share_bps: self.pool_fee_pool_share_bps,
            pool_fee_creator_share_bps: self.pool_fee_creator_share_bps,
            redeem_fee_bps: self.redeem_fee_bps,
            brake_drop_bps: self.brake_drop_bps,
            brake_window_slots: self.brake_window_slots,
        }
    }

    pub fn from_core(p: fc::Params) -> Self {
        CoinParams {
            virtual_sol: p.virtual_sol,
            virtual_tok: p.virtual_tok,
            curve_supply: p.curve_supply,
            graduation_sol: p.graduation_sol,
            curve_fee_bps: p.curve_fee_bps,
            curve_fee_creator_share_bps: p.curve_fee_creator_share_bps,
            curve_fee_protocol_share_bps: p.curve_fee_protocol_share_bps,
            pool_fee_bps: p.pool_fee_bps,
            pool_fee_pool_share_bps: p.pool_fee_pool_share_bps,
            pool_fee_creator_share_bps: p.pool_fee_creator_share_bps,
            redeem_fee_bps: p.redeem_fee_bps,
            brake_drop_bps: p.brake_drop_bps,
            brake_window_slots: p.brake_window_slots,
        }
    }

    pub const DEFAULT: CoinParams = CoinParams {
        virtual_sol: fc::Params::DEFAULT.virtual_sol,
        virtual_tok: fc::Params::DEFAULT.virtual_tok,
        curve_supply: fc::Params::DEFAULT.curve_supply,
        graduation_sol: fc::Params::DEFAULT.graduation_sol,
        curve_fee_bps: fc::Params::DEFAULT.curve_fee_bps,
        curve_fee_creator_share_bps: fc::Params::DEFAULT.curve_fee_creator_share_bps,
        curve_fee_protocol_share_bps: fc::Params::DEFAULT.curve_fee_protocol_share_bps,
        pool_fee_bps: fc::Params::DEFAULT.pool_fee_bps,
        pool_fee_pool_share_bps: fc::Params::DEFAULT.pool_fee_pool_share_bps,
        pool_fee_creator_share_bps: fc::Params::DEFAULT.pool_fee_creator_share_bps,
        redeem_fee_bps: fc::Params::DEFAULT.redeem_fee_bps,
        brake_drop_bps: fc::Params::DEFAULT.brake_drop_bps,
        brake_window_slots: fc::Params::DEFAULT.brake_window_slots,
    };
}

/// Protocol-wide settings. The authority can only change what applies to
/// coins created *later* and where protocol fees are sent. It has no
/// instruction that moves SOL out of any vault.
#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    pub authority: Pubkey,
    pub protocol_fee_recipient: Pubkey,
    /// Defaults copied into every new coin.
    pub params: CoinParams,
    /// Reward paid to permissionless crankers (`graduate`, `process_queue`),
    /// taken from the protocol share of the fees of the very trade they crank.
    pub crank_reward: u64,
    /// Flat fee paid by the creator at `create_coin`, to the protocol recipient.
    pub create_fee: u64,
    pub coins_created: u64,
    pub coins_graduated: u64,
    /// Sum of every lamport ever paid out by `redeem`, protocol-wide.
    pub total_redeemed_sol: u64,
    pub total_redeems: u64,
    pub bump: u8,
    pub reserved: [u8; 64],
}

#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Phase {
    Curve = 0,
    Graduated = 1,
}

/// Brake window and queue accumulator (see `floored_core::QueueAcc`).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq, InitSpace)]
pub struct BrakeState {
    /// Reserves at the start of the current window; `ref_sol / ref_tok` is the reference price.
    pub ref_sol: u64,
    pub ref_tok: u64,
    pub window_start: u64,
    pub epoch: u32,
    pub scale: u128,
    pub sol_index: u128,
    /// Tokens in the queue escrow, the `Q` of the floor formula.
    pub queued_total: u64,
    /// Number of times the queue went from empty to non-empty.
    pub engagements: u32,
    /// Number of aggregate fills executed.
    pub windows_processed: u32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq, InitSpace)]
pub struct Bumps {
    pub coin: u8,
    pub curve_vault: u8,
    pub floor_reserve: u8,
    pub pool_sol_vault: u8,
    pub fee_vault: u8,
    pub queue_sol_vault: u8,
    pub curve_token_vault: u8,
    pub pool_token_vault: u8,
    pub queue_escrow: u8,
}

#[account]
#[derive(InitSpace)]
pub struct CoinState {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub params: CoinParams,
    /// 0 = curve, 1 = graduated.
    pub phase: u8,
    // ── curve ──
    /// Real SOL in `curve_vault` (lamports, excluding rent).
    pub real_sol: u64,
    pub tokens_sold: u64,
    /// SOL in `floor_reserve` (0.3 % of curve volume), poured into the pool at graduation.
    pub floor_reserve: u64,
    // ── pool ──
    /// `S`: SOL in `pool_sol_vault` (excluding rent).
    pub pool_sol: u64,
    /// `T`: tokens in `pool_token_vault`.
    pub pool_tok: u64,
    // ── fees ──
    pub creator_fees_owed: u64,
    pub protocol_fees_owed: u64,
    pub creator_fees_claimed: u64,
    pub protocol_fees_claimed: u64,
    // ── stats ──
    pub total_redeemed_sol: u64,
    pub redeem_count: u64,
    pub total_pool_burned: u64,
    pub buy_count: u64,
    pub sell_count: u64,
    pub volume_sol: u64,
    // ── brake ──
    pub brake: BrakeState,
    pub created_slot: u64,
    pub graduated_slot: u64,
    /// Rent-exempt minimum of a 0-byte vault at creation; vault balance − this = tracked amount.
    pub vault_rent: u64,
    pub bumps: Bumps,
    pub reserved: [u8; 64],
}

impl CoinState {
    pub fn phase(&self) -> Phase {
        if self.phase == Phase::Graduated as u8 {
            Phase::Graduated
        } else {
            Phase::Curve
        }
    }
    pub fn core_params(&self) -> fc::Params {
        self.params.to_core()
    }
    pub fn curve(&self) -> fc::CurveState {
        fc::CurveState { real_sol: self.real_sol, tokens_sold: self.tokens_sold }
    }
    pub fn pool(&self) -> fc::PoolState {
        fc::PoolState { sol: self.pool_sol, tok: self.pool_tok }
    }
    pub fn acc(&self) -> fc::QueueAcc {
        fc::QueueAcc {
            epoch: self.brake.epoch,
            scale: self.brake.scale,
            sol_index: self.brake.sol_index,
            queued_total: self.brake.queued_total,
        }
    }
    pub fn set_acc(&mut self, a: fc::QueueAcc) {
        self.brake.epoch = a.epoch;
        self.brake.scale = a.scale;
        self.brake.sol_index = a.sol_index;
        self.brake.queued_total = a.queued_total;
    }
    /// Reserves that price the coin right now: virtual reserves on the curve, pool reserves after.
    pub fn reserves(&self) -> fc::CoreResult<(u64, u64)> {
        match self.phase() {
            Phase::Curve => self.curve().reserves(&self.core_params()),
            Phase::Graduated => Ok((self.pool_sol, self.pool_tok)),
        }
    }
}

/// One seller's position in the brake queue (one per wallet per coin).
#[account]
#[derive(InitSpace)]
pub struct QueueEntry {
    pub coin: Pubkey,
    pub owner: Pubkey,
    pub epoch: u32,
    pub shares: u128,
    pub sol_index_at_join: u128,
    pub joined_slot: u64,
    /// Tokens the seller put in the queue (informational; the live remainder is `shares · scale`).
    pub amount_queued: u64,
    pub bump: u8,
}

impl QueueEntry {
    pub fn position(&self) -> fc::QueuePosition {
        fc::QueuePosition { epoch: self.epoch, shares: self.shares, sol_index_at_join: self.sol_index_at_join }
    }
}

/// Final accumulator of a closed queue epoch, so that positions from that
/// epoch can be settled at any later time.
#[account]
#[derive(InitSpace)]
pub struct EpochRecord {
    pub coin: Pubkey,
    pub epoch: u32,
    pub closed: bool,
    pub final_sol_index: u128,
    pub bump: u8,
}
