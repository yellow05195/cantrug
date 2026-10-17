//! Account validation for every instruction.
//!
//! Lamport vaults (`curve_vault`, `floor_reserve`, `pool_sol_vault`,
//! `fee_vault`, `queue_sol_vault`) are 0-byte accounts owned by this program;
//! their address is checked by seeds, their owner by constraint. Token vaults
//! are SPL token accounts whose authority is the `coin` PDA.

use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::metadata::Metadata;
use anchor_spl::token::{Mint, Token, TokenAccount};
use floored_core::DECIMALS;

// ───────────────────────────── config ─────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, space = 8 + GlobalConfig::INIT_SPACE, seeds = [SEED_CONFIG], bump)]
    pub config: Account<'info, GlobalConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [SEED_CONFIG], bump = config.bump, has_one = authority)]
    pub config: Account<'info, GlobalConfig>,
}

// ───────────────────────────── create ─────────────────────────────

#[derive(Accounts)]
pub struct CreateCoin<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Box<Account<'info, GlobalConfig>>,
    /// CHECK: pinned to the recipient stored in config; receives the flat creation fee.
    #[account(mut, address = config.protocol_fee_recipient)]
    pub protocol_fee_recipient: UncheckedAccount<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + CoinState::INIT_SPACE,
        seeds = [SEED_COIN, mint.key().as_ref()],
        bump
    )]
    pub coin: Box<Account<'info, CoinState>>,
    /// New mint; any keypair (vanity addresses welcome). Mint authority is the coin PDA and is revoked in this instruction. No freeze authority.
    #[account(
        init,
        payer = creator,
        mint::decimals = DECIMALS,
        mint::authority = coin,
    )]
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: 0-byte lamport vault created in the handler.
    #[account(mut, seeds = [SEED_CURVE_VAULT, coin.key().as_ref()], bump)]
    pub curve_vault: UncheckedAccount<'info>,
    /// CHECK: 0-byte lamport vault created in the handler.
    #[account(mut, seeds = [SEED_FLOOR_RESERVE, coin.key().as_ref()], bump)]
    pub floor_reserve: UncheckedAccount<'info>,
    /// CHECK: 0-byte lamport vault created in the handler.
    #[account(mut, seeds = [SEED_POOL_SOL, coin.key().as_ref()], bump)]
    pub pool_sol_vault: UncheckedAccount<'info>,
    /// CHECK: 0-byte lamport vault created in the handler.
    #[account(mut, seeds = [SEED_FEE_VAULT, coin.key().as_ref()], bump)]
    pub fee_vault: UncheckedAccount<'info>,
    /// CHECK: 0-byte lamport vault created in the handler.
    #[account(mut, seeds = [SEED_QUEUE_SOL, coin.key().as_ref()], bump)]
    pub queue_sol_vault: UncheckedAccount<'info>,
    #[account(
        init,
        payer = creator,
        seeds = [SEED_CURVE_TOKENS, coin.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = coin,
    )]
    pub curve_token_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = creator,
        seeds = [SEED_POOL_TOKENS, coin.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = coin,
    )]
    pub pool_token_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = creator,
        seeds = [SEED_QUEUE_ESCROW, coin.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = coin,
    )]
    pub queue_escrow: Box<Account<'info, TokenAccount>>,
    /// CHECK: Metaplex metadata PDA, validated by the token metadata program.
    #[account(mut)]
    pub metadata: UncheckedAccount<'info>,
    pub token_metadata_program: Program<'info, Metadata>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

// ───────────────────────────── curve trades ─────────────────────────────

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [SEED_COIN, mint.key().as_ref()], bump = coin.bumps.coin, has_one = mint)]
    pub coin: Box<Account<'info, CoinState>>,
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_CURVE_VAULT, coin.key().as_ref()], bump = coin.bumps.curve_vault, owner = crate::ID)]
    pub curve_vault: UncheckedAccount<'info>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_FLOOR_RESERVE, coin.key().as_ref()], bump = coin.bumps.floor_reserve, owner = crate::ID)]
    pub floor_reserve: UncheckedAccount<'info>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_FEE_VAULT, coin.key().as_ref()], bump = coin.bumps.fee_vault, owner = crate::ID)]
    pub fee_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [SEED_CURVE_TOKENS, coin.key().as_ref()], bump = coin.bumps.curve_token_vault)]
    pub curve_token_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub user_token: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

/// `sell` on the curve. Carries the queue accounts because part of the order
/// may be braked, and the previous window's queue is filled first.
#[derive(Accounts)]
pub struct Sell<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Box<Account<'info, GlobalConfig>>,
    #[account(mut, seeds = [SEED_COIN, mint.key().as_ref()], bump = coin.bumps.coin, has_one = mint)]
    pub coin: Box<Account<'info, CoinState>>,
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_CURVE_VAULT, coin.key().as_ref()], bump = coin.bumps.curve_vault, owner = crate::ID)]
    pub curve_vault: UncheckedAccount<'info>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_FLOOR_RESERVE, coin.key().as_ref()], bump = coin.bumps.floor_reserve, owner = crate::ID)]
    pub floor_reserve: UncheckedAccount<'info>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_FEE_VAULT, coin.key().as_ref()], bump = coin.bumps.fee_vault, owner = crate::ID)]
    pub fee_vault: UncheckedAccount<'info>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_QUEUE_SOL, coin.key().as_ref()], bump = coin.bumps.queue_sol_vault, owner = crate::ID)]
    pub queue_sol_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [SEED_CURVE_TOKENS, coin.key().as_ref()], bump = coin.bumps.curve_token_vault)]
    pub curve_token_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [SEED_QUEUE_ESCROW, coin.key().as_ref()], bump = coin.bumps.queue_escrow)]
    pub queue_escrow: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = user)]
    pub user_token: Box<Account<'info, TokenAccount>>,
    /// CHECK: `QueueEntry` PDA for (coin, user); created only if part of the order is queued.
    #[account(mut, seeds = [SEED_QUEUE_ENTRY, coin.key().as_ref(), user.key().as_ref()], bump)]
    pub queue_entry: UncheckedAccount<'info>,
    /// CHECK: `EpochRecord` PDA of the current epoch; created only if this call closes the epoch.
    #[account(mut, seeds = [SEED_EPOCH, coin.key().as_ref(), &coin.brake.epoch.to_le_bytes()], bump)]
    pub epoch_record: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ───────────────────────────── graduation ─────────────────────────────

#[derive(Accounts)]
pub struct Graduate<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(mut, seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Box<Account<'info, GlobalConfig>>,
    #[account(mut, seeds = [SEED_COIN, mint.key().as_ref()], bump = coin.bumps.coin, has_one = mint)]
    pub coin: Box<Account<'info, CoinState>>,
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_CURVE_VAULT, coin.key().as_ref()], bump = coin.bumps.curve_vault, owner = crate::ID)]
    pub curve_vault: UncheckedAccount<'info>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_FLOOR_RESERVE, coin.key().as_ref()], bump = coin.bumps.floor_reserve, owner = crate::ID)]
    pub floor_reserve: UncheckedAccount<'info>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_POOL_SOL, coin.key().as_ref()], bump = coin.bumps.pool_sol_vault, owner = crate::ID)]
    pub pool_sol_vault: UncheckedAccount<'info>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_FEE_VAULT, coin.key().as_ref()], bump = coin.bumps.fee_vault, owner = crate::ID)]
    pub fee_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [SEED_CURVE_TOKENS, coin.key().as_ref()], bump = coin.bumps.curve_token_vault)]
    pub curve_token_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [SEED_POOL_TOKENS, coin.key().as_ref()], bump = coin.bumps.pool_token_vault)]
    pub pool_token_vault: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

// ───────────────────────────── pool trades ─────────────────────────────

#[derive(Accounts)]
pub struct SwapBuy<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [SEED_COIN, mint.key().as_ref()], bump = coin.bumps.coin, has_one = mint)]
    pub coin: Box<Account<'info, CoinState>>,
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_POOL_SOL, coin.key().as_ref()], bump = coin.bumps.pool_sol_vault, owner = crate::ID)]
    pub pool_sol_vault: UncheckedAccount<'info>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_FEE_VAULT, coin.key().as_ref()], bump = coin.bumps.fee_vault, owner = crate::ID)]
    pub fee_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [SEED_POOL_TOKENS, coin.key().as_ref()], bump = coin.bumps.pool_token_vault)]
    pub pool_token_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub user_token: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SwapSell<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Box<Account<'info, GlobalConfig>>,
    #[account(mut, seeds = [SEED_COIN, mint.key().as_ref()], bump = coin.bumps.coin, has_one = mint)]
    pub coin: Box<Account<'info, CoinState>>,
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_POOL_SOL, coin.key().as_ref()], bump = coin.bumps.pool_sol_vault, owner = crate::ID)]
    pub pool_sol_vault: UncheckedAccount<'info>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_FEE_VAULT, coin.key().as_ref()], bump = coin.bumps.fee_vault, owner = crate::ID)]
    pub fee_vault: UncheckedAccount<'info>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_QUEUE_SOL, coin.key().as_ref()], bump = coin.bumps.queue_sol_vault, owner = crate::ID)]
    pub queue_sol_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [SEED_POOL_TOKENS, coin.key().as_ref()], bump = coin.bumps.pool_token_vault)]
    pub pool_token_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [SEED_QUEUE_ESCROW, coin.key().as_ref()], bump = coin.bumps.queue_escrow)]
    pub queue_escrow: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = user)]
    pub user_token: Box<Account<'info, TokenAccount>>,
    /// CHECK: `QueueEntry` PDA for (coin, user); created only if part of the order is queued.
    #[account(mut, seeds = [SEED_QUEUE_ENTRY, coin.key().as_ref(), user.key().as_ref()], bump)]
    pub queue_entry: UncheckedAccount<'info>,
    /// CHECK: `EpochRecord` PDA of the current epoch; created only if this call closes the epoch.
    #[account(mut, seeds = [SEED_EPOCH, coin.key().as_ref(), &coin.brake.epoch.to_le_bytes()], bump)]
    pub epoch_record: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ───────────────────────────── the floor ─────────────────────────────

#[derive(Accounts)]
pub struct Redeem<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Box<Account<'info, GlobalConfig>>,
    #[account(mut, seeds = [SEED_COIN, mint.key().as_ref()], bump = coin.bumps.coin, has_one = mint)]
    pub coin: Box<Account<'info, CoinState>>,
    #[account(mut)]
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_POOL_SOL, coin.key().as_ref()], bump = coin.bumps.pool_sol_vault, owner = crate::ID)]
    pub pool_sol_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [SEED_POOL_TOKENS, coin.key().as_ref()], bump = coin.bumps.pool_token_vault)]
    pub pool_token_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = user)]
    pub user_token: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

// ───────────────────────────── the queue ─────────────────────────────

/// Permissionless crank: fills the queue for a new window. Carries both
/// venues so it works before and after graduation.
#[derive(Accounts)]
pub struct ProcessQueue<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Box<Account<'info, GlobalConfig>>,
    #[account(mut, seeds = [SEED_COIN, mint.key().as_ref()], bump = coin.bumps.coin, has_one = mint)]
    pub coin: Box<Account<'info, CoinState>>,
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_CURVE_VAULT, coin.key().as_ref()], bump = coin.bumps.curve_vault, owner = crate::ID)]
    pub curve_vault: UncheckedAccount<'info>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_FLOOR_RESERVE, coin.key().as_ref()], bump = coin.bumps.floor_reserve, owner = crate::ID)]
    pub floor_reserve: UncheckedAccount<'info>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_POOL_SOL, coin.key().as_ref()], bump = coin.bumps.pool_sol_vault, owner = crate::ID)]
    pub pool_sol_vault: UncheckedAccount<'info>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_FEE_VAULT, coin.key().as_ref()], bump = coin.bumps.fee_vault, owner = crate::ID)]
    pub fee_vault: UncheckedAccount<'info>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_QUEUE_SOL, coin.key().as_ref()], bump = coin.bumps.queue_sol_vault, owner = crate::ID)]
    pub queue_sol_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [SEED_CURVE_TOKENS, coin.key().as_ref()], bump = coin.bumps.curve_token_vault)]
    pub curve_token_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [SEED_POOL_TOKENS, coin.key().as_ref()], bump = coin.bumps.pool_token_vault)]
    pub pool_token_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, seeds = [SEED_QUEUE_ESCROW, coin.key().as_ref()], bump = coin.bumps.queue_escrow)]
    pub queue_escrow: Box<Account<'info, TokenAccount>>,
    /// CHECK: `EpochRecord` PDA of the current epoch; created only if this call closes the epoch.
    #[account(mut, seeds = [SEED_EPOCH, coin.key().as_ref(), &coin.brake.epoch.to_le_bytes()], bump)]
    pub epoch_record: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

/// `claim_queue` (take the SOL earned so far, stay queued) and `cancel_queue`
/// (take the SOL earned and the tokens left).
#[derive(Accounts)]
pub struct SettleQueue<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [SEED_COIN, mint.key().as_ref()], bump = coin.bumps.coin, has_one = mint)]
    pub coin: Box<Account<'info, CoinState>>,
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_QUEUE_SOL, coin.key().as_ref()], bump = coin.bumps.queue_sol_vault, owner = crate::ID)]
    pub queue_sol_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [SEED_QUEUE_ESCROW, coin.key().as_ref()], bump = coin.bumps.queue_escrow)]
    pub queue_escrow: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = mint, token::authority = user)]
    pub user_token: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        seeds = [SEED_QUEUE_ENTRY, coin.key().as_ref(), user.key().as_ref()],
        bump = queue_entry.bump,
        has_one = coin,
        constraint = queue_entry.owner == user.key() @ crate::errors::FloorError::QueueEntryMismatch,
    )]
    pub queue_entry: Box<Account<'info, QueueEntry>>,
    /// CHECK: `EpochRecord` of the entry's epoch; only read when that epoch is closed.
    #[account(seeds = [SEED_EPOCH, coin.key().as_ref(), &queue_entry.epoch.to_le_bytes()], bump)]
    pub epoch_record: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

/// `queue_to_redeem`: leave the queue and redeem what is left at the floor, instantly.
#[derive(Accounts)]
pub struct QueueToRedeem<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut, seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Box<Account<'info, GlobalConfig>>,
    #[account(mut, seeds = [SEED_COIN, mint.key().as_ref()], bump = coin.bumps.coin, has_one = mint)]
    pub coin: Box<Account<'info, CoinState>>,
    #[account(mut)]
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_POOL_SOL, coin.key().as_ref()], bump = coin.bumps.pool_sol_vault, owner = crate::ID)]
    pub pool_sol_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [SEED_POOL_TOKENS, coin.key().as_ref()], bump = coin.bumps.pool_token_vault)]
    pub pool_token_vault: Box<Account<'info, TokenAccount>>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_QUEUE_SOL, coin.key().as_ref()], bump = coin.bumps.queue_sol_vault, owner = crate::ID)]
    pub queue_sol_vault: UncheckedAccount<'info>,
    #[account(mut, seeds = [SEED_QUEUE_ESCROW, coin.key().as_ref()], bump = coin.bumps.queue_escrow)]
    pub queue_escrow: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        close = user,
        seeds = [SEED_QUEUE_ENTRY, coin.key().as_ref(), user.key().as_ref()],
        bump = queue_entry.bump,
        has_one = coin,
        constraint = queue_entry.owner == user.key() @ crate::errors::FloorError::QueueEntryMismatch,
    )]
    pub queue_entry: Box<Account<'info, QueueEntry>>,
    /// CHECK: `EpochRecord` of the entry's epoch; only read when that epoch is closed.
    #[account(seeds = [SEED_EPOCH, coin.key().as_ref(), &queue_entry.epoch.to_le_bytes()], bump)]
    pub epoch_record: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}

// ───────────────────────────── fees ─────────────────────────────

#[derive(Accounts)]
pub struct ClaimCreatorFees<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, seeds = [SEED_COIN, coin.mint.as_ref()], bump = coin.bumps.coin, has_one = creator)]
    pub coin: Box<Account<'info, CoinState>>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_FEE_VAULT, coin.key().as_ref()], bump = coin.bumps.fee_vault, owner = crate::ID)]
    pub fee_vault: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ClaimProtocolFees<'info> {
    pub caller: Signer<'info>,
    #[account(seeds = [SEED_CONFIG], bump = config.bump)]
    pub config: Box<Account<'info, GlobalConfig>>,
    #[account(mut, seeds = [SEED_COIN, coin.mint.as_ref()], bump = coin.bumps.coin)]
    pub coin: Box<Account<'info, CoinState>>,
    /// CHECK: lamport vault, seeds + owner.
    #[account(mut, seeds = [SEED_FEE_VAULT, coin.key().as_ref()], bump = coin.bumps.fee_vault, owner = crate::ID)]
    pub fee_vault: UncheckedAccount<'info>,
    /// CHECK: pinned to the recipient stored in config.
    #[account(mut, address = config.protocol_fee_recipient)]
    pub protocol_fee_recipient: UncheckedAccount<'info>,
}
