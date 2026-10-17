//! FLOORED on-chain program.
//!
//! A memecoin launchpad where the liquidity pool belongs to the holders.
//!
//! * **The floor** — after graduation, any holder can `redeem(x)`: burn `x`
//!   tokens and receive `S · x / C` SOL straight from the pool (`S` = pool
//!   SOL, `C` = circulating supply). The pool burns `T · x / C` of its own
//!   tokens in the same step, so the price does not move and nobody else's
//!   floor drops. The last holder takes every lamport left.
//! * **The brake** — no sale, or group of sales, can push the price more
//!   than 20 % under the price at the start of the current 150-slot window.
//!   The part of an order that does not fit is queued and served pro rata of
//!   size, window after window, through a single aggregate swap per window.
//!   `redeem` is never braked.
//!
//! What this program deliberately does NOT have:
//!   * any instruction that moves SOL out of a vault to an admin — the
//!     `GlobalConfig` authority can only tune defaults for *future* coins and
//!     pick where the protocol fee share goes;
//!   * any oracle or external price input — every number is derived from the
//!     program's own state;
//!   * any LP token — the pool is a PDA; nobody can withdraw liquidity;
//!   * any mint or freeze authority after `create_coin`;
//!   * any pause switch.
//!
//! All arithmetic lives in `floored-core` (property-tested natively); this
//! crate validates accounts and moves lamports and tokens by the deltas the
//! core returns, rounding always in favour of the pool.

#![allow(unexpected_cfgs)]
#![allow(clippy::too_many_arguments)]
#![allow(clippy::result_large_err)]

pub mod contexts;
pub mod errors;
pub mod events;
pub mod state;
pub mod util;

use anchor_lang::prelude::*;
use anchor_spl::metadata::{create_metadata_accounts_v3, mpl_token_metadata::types::DataV2, CreateMetadataAccountsV3};
use anchor_spl::token::{self, spl_token::instruction::AuthorityType, Burn, MintTo, SetAuthority, Token};
use floored_core as fc;

pub use contexts::*;
pub use errors::*;
pub use events::*;
pub use state::*;
use util::*;

declare_id!("E7ZbamLD8wenjjHitR8bUHwuNKA4Em39sqybnhk3nc87");

#[program]
pub mod floored {
    use super::*;

    // ───────────────────────── config ─────────────────────────

    /// One-time setup. `params` become the defaults copied into every coin.
    pub fn initialize(
        ctx: Context<Initialize>,
        params: CoinParams,
        crank_reward: u64,
        create_fee: u64,
        protocol_fee_recipient: Pubkey,
    ) -> Result<()> {
        params.to_core().validate().or_err()?;
        let c = &mut ctx.accounts.config;
        c.authority = ctx.accounts.authority.key();
        c.protocol_fee_recipient = protocol_fee_recipient;
        c.params = params;
        c.crank_reward = crank_reward;
        c.create_fee = create_fee;
        c.bump = ctx.bumps.config;
        Ok(())
    }

    /// Change defaults for coins created from now on, the fee recipient, the
    /// crank reward, or hand the authority over. Existing coins are untouched.
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        params: Option<CoinParams>,
        crank_reward: Option<u64>,
        create_fee: Option<u64>,
        protocol_fee_recipient: Option<Pubkey>,
        new_authority: Option<Pubkey>,
    ) -> Result<()> {
        let c = &mut ctx.accounts.config;
        if let Some(p) = params {
            p.to_core().validate().or_err()?;
            c.params = p;
        }
        if let Some(r) = crank_reward {
            c.crank_reward = r;
        }
        if let Some(f) = create_fee {
            c.create_fee = f;
        }
        if let Some(k) = protocol_fee_recipient {
            c.protocol_fee_recipient = k;
        }
        if let Some(a) = new_authority {
            c.authority = a;
        }
        Ok(())
    }

    // ───────────────────────── create ─────────────────────────

    /// Mint 1 000 000 000 tokens into the curve vault, create the Metaplex
    /// metadata, revoke the mint authority, open the five lamport vaults, and
    /// freeze the parameters into the coin. An optional first buy is a
    /// separate `buy` instruction in the same transaction (same rules).
    pub fn create_coin(ctx: Context<CreateCoin>, name: String, symbol: String, uri: String) -> Result<()> {
        require!(name.len() <= MAX_NAME, FloorError::NameTooLong);
        require!(symbol.len() <= MAX_SYMBOL, FloorError::SymbolTooLong);
        require!(uri.len() <= MAX_URI, FloorError::UriTooLong);
        let clock = Clock::get()?;
        let params = ctx.accounts.config.params;
        params.to_core().validate().or_err()?;

        let mint_key = ctx.accounts.mint.key();
        let coin_key = ctx.accounts.coin.key();
        let coin_bump = ctx.bumps.coin;
        let sys = ctx.accounts.system_program.to_account_info();
        let creator = ctx.accounts.creator.to_account_info();

        // Five 0-byte lamport vaults owned by this program.
        let vaults: [(&AccountInfo, &[u8], u8); 5] = [
            (&ctx.accounts.curve_vault, SEED_CURVE_VAULT, ctx.bumps.curve_vault),
            (&ctx.accounts.floor_reserve, SEED_FLOOR_RESERVE, ctx.bumps.floor_reserve),
            (&ctx.accounts.pool_sol_vault, SEED_POOL_SOL, ctx.bumps.pool_sol_vault),
            (&ctx.accounts.fee_vault, SEED_FEE_VAULT, ctx.bumps.fee_vault),
            (&ctx.accounts.queue_sol_vault, SEED_QUEUE_SOL, ctx.bumps.queue_sol_vault),
        ];
        for (info, seed, bump) in vaults {
            create_pda_account(&creator, info, &sys, 0, &[seed, coin_key.as_ref(), &[bump]])?;
        }
        let vault_rent = Rent::get()?.minimum_balance(0);

        // Mint the whole supply into the curve vault, then revoke the mint authority.
        let seeds: &[&[u8]] = &[SEED_COIN, mint_key.as_ref(), &[coin_bump]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.curve_token_vault.to_account_info(),
                    authority: ctx.accounts.coin.to_account_info(),
                },
                &[seeds],
            ),
            fc::TOTAL_SUPPLY,
        )?;
        create_metadata_accounts_v3(
            CpiContext::new_with_signer(
                ctx.accounts.token_metadata_program.key(),
                CreateMetadataAccountsV3 {
                    metadata: ctx.accounts.metadata.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    mint_authority: ctx.accounts.coin.to_account_info(),
                    payer: ctx.accounts.creator.to_account_info(),
                    update_authority: ctx.accounts.coin.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
                &[seeds],
            ),
            DataV2 {
                name: name.clone(),
                symbol: symbol.clone(),
                uri: uri.clone(),
                seller_fee_basis_points: 0,
                creators: None,
                collection: None,
                uses: None,
            },
            false,
            true,
            None,
        )?;
        token::set_authority(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                SetAuthority {
                    account_or_mint: ctx.accounts.mint.to_account_info(),
                    current_authority: ctx.accounts.coin.to_account_info(),
                },
                &[seeds],
            ),
            AuthorityType::MintTokens,
            None,
        )?;

        // Flat creation fee, if any, straight to the protocol recipient.
        let create_fee = ctx.accounts.config.create_fee;
        transfer_in(&sys, &creator, &ctx.accounts.protocol_fee_recipient.to_account_info(), create_fee)?;

        let coin = &mut ctx.accounts.coin;
        coin.mint = mint_key;
        coin.creator = ctx.accounts.creator.key();
        coin.params = params;
        coin.phase = Phase::Curve as u8;
        coin.brake = BrakeState {
            ref_sol: params.virtual_sol,
            ref_tok: params.virtual_tok,
            window_start: clock.slot,
            epoch: 0,
            scale: fc::SCALE_ONE,
            sol_index: 0,
            queued_total: 0,
            engagements: 0,
            windows_processed: 0,
        };
        coin.created_slot = clock.slot;
        coin.vault_rent = vault_rent;
        coin.bumps = Bumps {
            coin: coin_bump,
            curve_vault: ctx.bumps.curve_vault,
            floor_reserve: ctx.bumps.floor_reserve,
            pool_sol_vault: ctx.bumps.pool_sol_vault,
            fee_vault: ctx.bumps.fee_vault,
            queue_sol_vault: ctx.bumps.queue_sol_vault,
            curve_token_vault: ctx.bumps.curve_token_vault,
            pool_token_vault: ctx.bumps.pool_token_vault,
            queue_escrow: ctx.bumps.queue_escrow,
        };
        let cfg = &mut ctx.accounts.config;
        cfg.coins_created = cfg.coins_created.checked_add(1).ok_or(FloorError::Overflow)?;

        emit!(CoinCreated {
            mint: mint_key,
            coin: coin_key,
            creator: coin.creator,
            name,
            symbol,
            uri,
            params,
            supply: fc::TOTAL_SUPPLY,
            slot: clock.slot,
            timestamp: clock.unix_timestamp,
        });
        Ok(())
    }

    // ───────────────────────── curve ─────────────────────────

    /// Buy on the curve with at most `sol_max` lamports (fee included). The
    /// last buy is capped so the curve collects exactly its graduation SOL;
    /// the unused part is simply not charged. Buys are never braked.
    pub fn buy(ctx: Context<Buy>, sol_max: u64, min_tokens_out: u64) -> Result<()> {
        let clock = Clock::get()?;
        let coin = &mut ctx.accounts.coin;
        require!(coin.phase() == Phase::Curve, FloorError::WrongPhase);
        let p = coin.core_params();
        let q = fc::curve_buy(&p, &coin.curve(), sol_max).or_err()?;
        require!(q.tokens_out >= min_tokens_out, FloorError::SlippageExceeded);

        let sys = ctx.accounts.system_program.to_account_info();
        let user = ctx.accounts.user.to_account_info();
        transfer_in(&sys, &user, &ctx.accounts.curve_vault, q.sol_net)?;
        transfer_in(&sys, &user, &ctx.accounts.floor_reserve, q.fee.pool)?;
        transfer_in(&sys, &user, &ctx.accounts.fee_vault, q.fee.creator.checked_add(q.fee.protocol).ok_or(FloorError::Overflow)?)?;
        token_transfer_from_coin(
            &ctx.accounts.token_program,
            &ctx.accounts.curve_token_vault.to_account_info(),
            &ctx.accounts.user_token.to_account_info(),
            &coin.to_account_info(),
            &coin.mint,
            coin.bumps.coin,
            q.tokens_out,
        )?;

        coin.real_sol = coin.real_sol.checked_add(q.sol_net).ok_or(FloorError::Overflow)?;
        coin.tokens_sold = coin.tokens_sold.checked_add(q.tokens_out).ok_or(FloorError::Overflow)?;
        coin.floor_reserve = coin.floor_reserve.checked_add(q.fee.pool).ok_or(FloorError::Overflow)?;
        add_fees(coin, q.fee.creator, q.fee.protocol)?;
        coin.buy_count = coin.buy_count.saturating_add(1);
        coin.volume_sol = coin.volume_sol.saturating_add(q.sol_charged);
        lift_reference(coin)?;

        check_vault(&ctx.accounts.curve_vault, coin.real_sol, coin.vault_rent)?;
        check_vault(&ctx.accounts.floor_reserve, coin.floor_reserve, coin.vault_rent)?;
        emit_trade(coin, ctx.accounts.user.key(), true, false, q.sol_charged, q.tokens_out, q.fee.total, q.fee.pool, ctx.accounts.mint.supply, 0, &clock)?;
        Ok(())
    }

    /// Sell on the curve. The previous window's queue is filled first; then
    /// the part of this order that fits under the brake executes at once and
    /// the rest is queued (if `queue_remainder`) or left in the wallet.
    /// `min_sol_out` is a price limit: it applies pro rata to the part that executes.
    pub fn sell(ctx: Context<Sell>, tokens_in: u64, min_sol_out: u64, queue_remainder: bool) -> Result<()> {
        require!(ctx.accounts.coin.phase() == Phase::Curve, FloorError::WrongPhase);
        let a = &ctx.accounts;
        let venue = Venue {
            sol_vault: &a.curve_vault,
            token_vault: &a.curve_token_vault.to_account_info(),
            floor_reserve: Some(&a.floor_reserve),
            fee_vault: &a.fee_vault,
            coin_info: &a.coin.to_account_info(),
            token_program: &a.token_program,
        };
        let q = QueueAccounts {
            escrow: &a.queue_escrow.to_account_info(),
            queue_sol_vault: &a.queue_sol_vault,
            epoch_record: &a.epoch_record,
            system_program: &a.system_program.to_account_info(),
        };
        let user = a.user.to_account_info();
        let mut coin = (*a.coin).clone();
        sell_common(
            &mut coin,
            &venue,
            &q,
            &user,
            &a.user_token.to_account_info(),
            &a.queue_entry,
            ctx.bumps.queue_entry,
            a.mint.supply,
            a.config.crank_reward,
            tokens_in,
            min_sol_out,
            queue_remainder,
        )?;
        *ctx.accounts.coin = coin;
        let coin = &ctx.accounts.coin;
        check_vault(&ctx.accounts.curve_vault, coin.real_sol, coin.vault_rent)?;
        check_vault(&ctx.accounts.floor_reserve, coin.floor_reserve, coin.vault_rent)?;
        Ok(())
    }

    // ───────────────────────── graduation ─────────────────────────

    /// Permissionless. Opens the program-owned pool with every real lamport
    /// of the curve plus the floor reserve, and every unsold token. No LP
    /// token, no burn. The caller earns `crank_reward` from accrued protocol fees.
    pub fn graduate(ctx: Context<Graduate>) -> Result<()> {
        let clock = Clock::get()?;
        let coin = &mut ctx.accounts.coin;
        require!(coin.phase() == Phase::Curve, FloorError::WrongPhase);
        let p = coin.core_params();
        let pool = fc::graduation_pool(&p, &coin.curve(), coin.floor_reserve).or_err()?;

        move_lamports(&ctx.accounts.curve_vault, &ctx.accounts.pool_sol_vault, coin.real_sol)?;
        move_lamports(&ctx.accounts.floor_reserve, &ctx.accounts.pool_sol_vault, coin.floor_reserve)?;
        let unsold = ctx.accounts.curve_token_vault.amount;
        require!(unsold == pool.tok, FloorError::VaultAccounting);
        token_transfer_from_coin(
            &ctx.accounts.token_program,
            &ctx.accounts.curve_token_vault.to_account_info(),
            &ctx.accounts.pool_token_vault.to_account_info(),
            &coin.to_account_info(),
            &coin.mint,
            coin.bumps.coin,
            unsold,
        )?;

        let floor_reserve_added = coin.floor_reserve;
        coin.real_sol = 0;
        coin.floor_reserve = 0;
        coin.pool_sol = pool.sol;
        coin.pool_tok = pool.tok;
        coin.phase = Phase::Graduated as u8;
        coin.graduated_slot = clock.slot;
        coin.brake.ref_sol = pool.sol;
        coin.brake.ref_tok = pool.tok;
        coin.brake.window_start = clock.slot;

        // Crank reward out of accrued protocol fees (never out of the pool).
        let reward = ctx.accounts.config.crank_reward.min(coin.protocol_fees_owed);
        coin.protocol_fees_owed = coin.protocol_fees_owed.checked_sub(reward).ok_or(FloorError::Overflow)?;
        move_lamports(&ctx.accounts.fee_vault, &ctx.accounts.caller.to_account_info(), reward)?;

        let cfg = &mut ctx.accounts.config;
        cfg.coins_graduated = cfg.coins_graduated.saturating_add(1);

        check_vault(&ctx.accounts.pool_sol_vault, coin.pool_sol, coin.vault_rent)?;
        emit!(Graduated {
            mint: coin.mint,
            caller: ctx.accounts.caller.key(),
            pool_sol: pool.sol,
            pool_tok: pool.tok,
            floor_reserve_added,
            tokens_sold: coin.tokens_sold,
            supply: ctx.accounts.mint.supply,
            slot: clock.slot,
            timestamp: clock.unix_timestamp,
        });
        Ok(())
    }

    // ───────────────────────── pool ─────────────────────────

    /// Buy from the pool with `sol_in` lamports (fee included). 0.2 % of the
    /// trade stays in the pool. Buys are never braked.
    pub fn swap_buy(ctx: Context<SwapBuy>, sol_in: u64, min_tokens_out: u64) -> Result<()> {
        let clock = Clock::get()?;
        let coin = &mut ctx.accounts.coin;
        require!(coin.phase() == Phase::Graduated, FloorError::WrongPhase);
        let p = coin.core_params();
        let q = fc::pool_buy(&p, &coin.pool(), sol_in).or_err()?;
        require!(q.tokens_out >= min_tokens_out, FloorError::SlippageExceeded);

        let sys = ctx.accounts.system_program.to_account_info();
        let user = ctx.accounts.user.to_account_info();
        transfer_in(&sys, &user, &ctx.accounts.pool_sol_vault, q.sol_net.checked_add(q.fee.pool).ok_or(FloorError::Overflow)?)?;
        transfer_in(&sys, &user, &ctx.accounts.fee_vault, q.fee.creator.checked_add(q.fee.protocol).ok_or(FloorError::Overflow)?)?;
        token_transfer_from_coin(
            &ctx.accounts.token_program,
            &ctx.accounts.pool_token_vault.to_account_info(),
            &ctx.accounts.user_token.to_account_info(),
            &coin.to_account_info(),
            &coin.mint,
            coin.bumps.coin,
            q.tokens_out,
        )?;
        coin.pool_sol = q.after.sol;
        coin.pool_tok = q.after.tok;
        add_fees(coin, q.fee.creator, q.fee.protocol)?;
        coin.buy_count = coin.buy_count.saturating_add(1);
        coin.volume_sol = coin.volume_sol.saturating_add(sol_in);
        lift_reference(coin)?;
        check_vault(&ctx.accounts.pool_sol_vault, coin.pool_sol, coin.vault_rent)?;
        emit_trade(coin, ctx.accounts.user.key(), true, false, sol_in, q.tokens_out, q.fee.total, q.fee.pool, ctx.accounts.mint.supply, 0, &clock)?;
        Ok(())
    }

    /// Sell into the pool, under the brake (see `sell`).
    pub fn swap_sell(ctx: Context<SwapSell>, tokens_in: u64, min_sol_out: u64, queue_remainder: bool) -> Result<()> {
        require!(ctx.accounts.coin.phase() == Phase::Graduated, FloorError::WrongPhase);
        let a = &ctx.accounts;
        let venue = Venue {
            sol_vault: &a.pool_sol_vault,
            token_vault: &a.pool_token_vault.to_account_info(),
            floor_reserve: None,
            fee_vault: &a.fee_vault,
            coin_info: &a.coin.to_account_info(),
            token_program: &a.token_program,
        };
        let q = QueueAccounts {
            escrow: &a.queue_escrow.to_account_info(),
            queue_sol_vault: &a.queue_sol_vault,
            epoch_record: &a.epoch_record,
            system_program: &a.system_program.to_account_info(),
        };
        let user = a.user.to_account_info();
        let mut coin = (*a.coin).clone();
        sell_common(
            &mut coin,
            &venue,
            &q,
            &user,
            &a.user_token.to_account_info(),
            &a.queue_entry,
            ctx.bumps.queue_entry,
            a.mint.supply,
            a.config.crank_reward,
            tokens_in,
            min_sol_out,
            queue_remainder,
        )?;
        *ctx.accounts.coin = coin;
        let coin = &ctx.accounts.coin;
        check_vault(&ctx.accounts.pool_sol_vault, coin.pool_sol, coin.vault_rent)?;
        Ok(())
    }

    // ───────────────────────── the floor ─────────────────────────

    /// Burn `tokens` and receive their exact share of the pool SOL, minus a
    /// 0.5 % exit fee that stays in the pool (waived for the last holder).
    /// Never braked, never paused, never permissioned.
    pub fn redeem(ctx: Context<Redeem>, tokens: u64) -> Result<()> {
        let clock = Clock::get()?;
        let coin = &mut ctx.accounts.coin;
        require!(coin.phase() == Phase::Graduated, FloorError::WrongPhase);
        let p = coin.core_params();
        let supply = ctx.accounts.mint.supply;
        let q = fc::redeem(&p, &coin.pool(), coin.brake.queued_total, supply, tokens).or_err()?;

        // Holder burns their tokens; the pool burns its matching share.
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.user_token.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            tokens,
        )?;
        burn_from_coin(
            &ctx.accounts.token_program,
            &ctx.accounts.mint.to_account_info(),
            &ctx.accounts.pool_token_vault.to_account_info(),
            &coin.to_account_info(),
            &coin.mint,
            coin.bumps.coin,
            q.pool_burn,
        )?;
        move_lamports(&ctx.accounts.pool_sol_vault, &ctx.accounts.user.to_account_info(), q.sol_out)?;

        coin.pool_sol = q.after.sol;
        coin.pool_tok = q.after.tok;
        coin.total_redeemed_sol = coin.total_redeemed_sol.saturating_add(q.sol_out);
        coin.redeem_count = coin.redeem_count.saturating_add(1);
        coin.total_pool_burned = coin.total_pool_burned.saturating_add(q.pool_burn);
        let cfg = &mut ctx.accounts.config;
        cfg.total_redeemed_sol = cfg.total_redeemed_sol.saturating_add(q.sol_out);
        cfg.total_redeems = cfg.total_redeems.saturating_add(1);

        check_vault(&ctx.accounts.pool_sol_vault, coin.pool_sol, coin.vault_rent)?;
        emit!(Redeemed {
            mint: coin.mint,
            user: ctx.accounts.user.key(),
            tokens_burned: tokens,
            pool_tokens_burned: q.pool_burn,
            sol_out: q.sol_out,
            fee_kept: q.fee_kept,
            pool_sol_after: q.after.sol,
            pool_tok_after: q.after.tok,
            supply_after: q.supply_after,
            circulating_after: q.circulating.checked_sub(tokens).ok_or(FloorError::Overflow)?,
            queued: coin.brake.queued_total,
            from_queue: false,
            slot: clock.slot,
            timestamp: clock.unix_timestamp,
        });
        Ok(())
    }

    // ───────────────────────── the queue ─────────────────────────

    /// Permissionless crank: when a new window has started and the queue is
    /// not empty, sell the window's allowance for the queue in one aggregate
    /// swap. The caller earns `crank_reward` out of that swap's protocol fee.
    pub fn process_queue(ctx: Context<ProcessQueue>) -> Result<()> {
        let clock = Clock::get()?;
        let a = &ctx.accounts;
        let (sol_vault, token_vault, floor): (&AccountInfo, AccountInfo, Option<&AccountInfo>) = match a.coin.phase() {
            Phase::Curve => (&a.curve_vault, a.curve_token_vault.to_account_info(), Some(&a.floor_reserve)),
            Phase::Graduated => (&a.pool_sol_vault, a.pool_token_vault.to_account_info(), None),
        };
        let venue = Venue {
            sol_vault,
            token_vault: &token_vault,
            floor_reserve: floor,
            fee_vault: &a.fee_vault,
            coin_info: &a.coin.to_account_info(),
            token_program: &a.token_program,
        };
        let q = QueueAccounts {
            escrow: &a.queue_escrow.to_account_info(),
            queue_sol_vault: &a.queue_sol_vault,
            epoch_record: &a.epoch_record,
            system_program: &a.system_program.to_account_info(),
        };
        let mut coin = (*a.coin).clone();
        require!(coin.brake.queued_total > 0, FloorError::QueueEmpty);
        let caller = a.caller.to_account_info();
        let (filled, reward) = settle_window(&mut coin, &venue, &q, &caller, a.mint.supply, a.config.crank_reward, &clock)?;
        require!(filled, FloorError::WindowNotElapsed);
        move_lamports(&a.fee_vault, &caller, reward)?;
        *ctx.accounts.coin = coin;
        Ok(())
    }

    /// Take the SOL your queued tokens have earned so far and stay in the queue.
    pub fn claim_queue(mut ctx: Context<SettleQueue>) -> Result<()> {
        let clock = Clock::get()?;
        let a = &mut ctx.accounts;
        let entry = &mut a.queue_entry;
        let pos = entry.position();
        let owed;
        if entry.epoch == a.coin.brake.epoch {
            owed = fc::entry_owed(&pos, a.coin.brake.sol_index).or_err()?;
            entry.sol_index_at_join = a.coin.brake.sol_index;
        } else {
            let rec: EpochRecord = read_account(&a.epoch_record)?;
            require!(rec.closed && rec.epoch == entry.epoch && rec.coin == a.coin.key(), FloorError::EpochRecordMismatch);
            owed = fc::entry_owed(&pos, rec.final_sol_index).or_err()?;
        }
        require!(owed > 0, FloorError::NothingToClaim);
        move_lamports(&a.queue_sol_vault, &a.user.to_account_info(), owed)?;
        let closed_epoch = entry.epoch != a.coin.brake.epoch;
        emit!(QueueSettled { mint: a.coin.mint, user: a.user.key(), kind: 0, tokens_returned: 0, tokens_redeemed: 0, sol_paid: owed, queued_after: a.coin.brake.queued_total, epoch: a.coin.brake.epoch, slot: clock.slot, timestamp: clock.unix_timestamp });
        if closed_epoch {
            // Nothing is left behind a closed epoch: free the account.
            a.queue_entry.close(a.user.to_account_info())?;
        }
        Ok(())
    }

    /// Leave the queue: get back the tokens not yet sold and the SOL earned.
    pub fn cancel_queue(mut ctx: Context<SettleQueue>) -> Result<()> {
        let clock = Clock::get()?;
        let a = &mut ctx.accounts;
        let pos = a.queue_entry.position();
        let (remaining, owed) = settle_position(&mut a.coin, &pos, &a.epoch_record)?;
        require!(remaining > 0 || owed > 0, FloorError::NothingToClaim);
        token_transfer_from_coin(
            &a.token_program,
            &a.queue_escrow.to_account_info(),
            &a.user_token.to_account_info(),
            &a.coin.to_account_info(),
            &a.coin.mint,
            a.coin.bumps.coin,
            remaining,
        )?;
        move_lamports(&a.queue_sol_vault, &a.user.to_account_info(), owed)?;
        emit!(QueueSettled { mint: a.coin.mint, user: a.user.key(), kind: 1, tokens_returned: remaining, tokens_redeemed: 0, sol_paid: owed, queued_after: a.coin.brake.queued_total, epoch: a.coin.brake.epoch, slot: clock.slot, timestamp: clock.unix_timestamp });
        if remaining > 0 && a.coin.brake.queued_total == 0 {
            emit!(BrakeReleased { mint: a.coin.mint, epoch: a.coin.brake.epoch, reason: 1, slot: clock.slot, timestamp: clock.unix_timestamp });
        }
        a.queue_entry.close(a.user.to_account_info())?;
        Ok(())
    }

    /// Leave the queue and redeem what is left at the floor, right now.
    pub fn queue_to_redeem(mut ctx: Context<QueueToRedeem>) -> Result<()> {
        let clock = Clock::get()?;
        let a = &mut ctx.accounts;
        require!(a.coin.phase() == Phase::Graduated, FloorError::WrongPhase);
        let pos = a.queue_entry.position();
        let (remaining, owed) = settle_position(&mut a.coin, &pos, &a.epoch_record)?;
        let mut sol_out = owed;
        let mut redeemed = 0u64;
        if remaining > 0 {
            let p = a.coin.core_params();
            let supply = a.mint.supply;
            let q = fc::redeem(&p, &a.coin.pool(), a.coin.brake.queued_total, supply, remaining).or_err()?;
            burn_from_coin(&a.token_program, &a.mint.to_account_info(), &a.queue_escrow.to_account_info(), &a.coin.to_account_info(), &a.coin.mint, a.coin.bumps.coin, remaining)?;
            burn_from_coin(&a.token_program, &a.mint.to_account_info(), &a.pool_token_vault.to_account_info(), &a.coin.to_account_info(), &a.coin.mint, a.coin.bumps.coin, q.pool_burn)?;
            move_lamports(&a.pool_sol_vault, &a.user.to_account_info(), q.sol_out)?;
            a.coin.pool_sol = q.after.sol;
            a.coin.pool_tok = q.after.tok;
            a.coin.total_redeemed_sol = a.coin.total_redeemed_sol.saturating_add(q.sol_out);
            a.coin.redeem_count = a.coin.redeem_count.saturating_add(1);
            a.coin.total_pool_burned = a.coin.total_pool_burned.saturating_add(q.pool_burn);
            a.config.total_redeemed_sol = a.config.total_redeemed_sol.saturating_add(q.sol_out);
            a.config.total_redeems = a.config.total_redeems.saturating_add(1);
            sol_out = sol_out.checked_add(q.sol_out).ok_or(FloorError::Overflow)?;
            redeemed = remaining;
            emit!(Redeemed {
                mint: a.coin.mint,
                user: a.user.key(),
                tokens_burned: remaining,
                pool_tokens_burned: q.pool_burn,
                sol_out: q.sol_out,
                fee_kept: q.fee_kept,
                pool_sol_after: q.after.sol,
                pool_tok_after: q.after.tok,
                supply_after: q.supply_after,
                circulating_after: q.circulating.checked_sub(remaining).ok_or(FloorError::Overflow)?,
                queued: a.coin.brake.queued_total,
                from_queue: true,
                slot: clock.slot,
                timestamp: clock.unix_timestamp,
            });
        }
        require!(sol_out > 0, FloorError::NothingToClaim);
        move_lamports(&a.queue_sol_vault, &a.user.to_account_info(), owed)?;
        check_vault(&a.pool_sol_vault, a.coin.pool_sol, a.coin.vault_rent)?;
        emit!(QueueSettled { mint: a.coin.mint, user: a.user.key(), kind: 2, tokens_returned: 0, tokens_redeemed: redeemed, sol_paid: sol_out, queued_after: a.coin.brake.queued_total, epoch: a.coin.brake.epoch, slot: clock.slot, timestamp: clock.unix_timestamp });
        if redeemed > 0 && a.coin.brake.queued_total == 0 {
            emit!(BrakeReleased { mint: a.coin.mint, epoch: a.coin.brake.epoch, reason: 1, slot: clock.slot, timestamp: clock.unix_timestamp });
        }
        Ok(())
    }

    // ───────────────────────── fees ─────────────────────────

    pub fn claim_creator_fees(ctx: Context<ClaimCreatorFees>) -> Result<()> {
        let clock = Clock::get()?;
        let coin = &mut ctx.accounts.coin;
        let amount = coin.creator_fees_owed;
        require!(amount > 0, FloorError::NothingToClaim);
        coin.creator_fees_owed = 0;
        coin.creator_fees_claimed = coin.creator_fees_claimed.saturating_add(amount);
        move_lamports(&ctx.accounts.fee_vault, &ctx.accounts.creator.to_account_info(), amount)?;
        emit!(FeesClaimed { mint: coin.mint, kind: 0, recipient: ctx.accounts.creator.key(), amount, slot: clock.slot, timestamp: clock.unix_timestamp });
        Ok(())
    }

    /// Anyone can push the protocol's share to the recipient set in config.
    pub fn claim_protocol_fees(ctx: Context<ClaimProtocolFees>) -> Result<()> {
        let clock = Clock::get()?;
        let coin = &mut ctx.accounts.coin;
        let amount = coin.protocol_fees_owed;
        require!(amount > 0, FloorError::NothingToClaim);
        coin.protocol_fees_owed = 0;
        coin.protocol_fees_claimed = coin.protocol_fees_claimed.saturating_add(amount);
        move_lamports(&ctx.accounts.fee_vault, &ctx.accounts.protocol_fee_recipient.to_account_info(), amount)?;
        emit!(FeesClaimed { mint: coin.mint, kind: 1, recipient: ctx.accounts.protocol_fee_recipient.key(), amount, slot: clock.slot, timestamp: clock.unix_timestamp });
        Ok(())
    }
}

// ═══════════════════════════ shared sell / brake machinery ═══════════════════════════
//
// Ordering rule enforced everywhere below: every CPI that involves the user
// (token transfers, PDA creation paid by the user) happens BEFORE any direct
// lamport credit to that user. The runtime checks the lamport balance of the
// accounts handed to a CPI, so credits to the seller are collected and paid
// at the very end of the instruction. Vault-to-vault moves are unaffected.

/// The venue a sale executes against: curve (with floor reserve) or pool.
pub struct Venue<'a, 'info> {
    pub sol_vault: &'a AccountInfo<'info>,
    pub token_vault: &'a AccountInfo<'info>,
    pub floor_reserve: Option<&'a AccountInfo<'info>>,
    pub fee_vault: &'a AccountInfo<'info>,
    pub coin_info: &'a AccountInfo<'info>,
    pub token_program: &'a Program<'info, Token>,
}

pub struct QueueAccounts<'a, 'info> {
    pub escrow: &'a AccountInfo<'info>,
    pub queue_sol_vault: &'a AccountInfo<'info>,
    pub epoch_record: &'a AccountInfo<'info>,
    pub system_program: &'a AccountInfo<'info>,
}

enum Seller<'a, 'info> {
    User(&'a AccountInfo<'info>),
    Coin,
}

fn add_fees(coin: &mut CoinState, creator: u64, protocol: u64) -> Result<()> {
    coin.creator_fees_owed = coin.creator_fees_owed.checked_add(creator).ok_or(FloorError::Overflow)?;
    coin.protocol_fees_owed = coin.protocol_fees_owed.checked_add(protocol).ok_or(FloorError::Overflow)?;
    Ok(())
}

/// After a buy, the brake reference follows the window high: no sale may
/// print more than `brake_drop_bps` under the highest price of the window.
fn lift_reference(coin: &mut CoinState) -> Result<()> {
    let (s, t) = coin.reserves().or_err()?;
    let higher = u128::from(s) * u128::from(coin.brake.ref_tok) > u128::from(coin.brake.ref_sol) * u128::from(t);
    if higher {
        coin.brake.ref_sol = s;
        coin.brake.ref_tok = t;
    }
    Ok(())
}

/// Execute a sale of `tokens` sitting in `from` against the venue that
/// matches the coin's phase: tokens in (CPI), fee routed, coin updated.
/// The net SOL is moved to `sol_dest` when given; otherwise it is left in
/// the venue vault for the caller to pay out later. Returns `(sol_net, fee)`.
fn execute_sell<'info>(
    coin: &mut CoinState,
    v: &Venue<'_, 'info>,
    tokens: u64,
    from: &AccountInfo<'info>,
    seller: Seller<'_, 'info>,
    sol_dest: Option<&AccountInfo<'info>>,
) -> Result<(u64, fc::FeeSplit)> {
    let p = coin.core_params();
    let mint = coin.mint;
    let bump = coin.bumps.coin;
    let (quote_curve, quote_pool) = match coin.phase() {
        Phase::Curve => {
            require!(v.floor_reserve.is_some(), FloorError::WrongPhase);
            (Some(fc::curve_sell(&p, &coin.curve(), tokens).or_err()?), None)
        }
        Phase::Graduated => {
            require!(v.floor_reserve.is_none(), FloorError::WrongPhase);
            (None, Some(fc::pool_sell(&p, &coin.pool(), tokens).or_err()?))
        }
    };
    match seller {
        Seller::User(u) => token_transfer_from_user(v.token_program, from, v.token_vault, u, tokens)?,
        Seller::Coin => token_transfer_from_coin(v.token_program, from, v.token_vault, v.coin_info, &mint, bump, tokens)?,
    }
    let (sol_net, fee) = if let Some(q) = quote_curve {
        let floor = v.floor_reserve.ok_or(FloorError::WrongPhase)?;
        move_lamports(v.sol_vault, v.fee_vault, q.fee.creator.checked_add(q.fee.protocol).ok_or(FloorError::Overflow)?)?;
        move_lamports(v.sol_vault, floor, q.fee.pool)?;
        coin.real_sol = coin.real_sol.checked_sub(q.sol_gross).ok_or(FloorError::Overflow)?;
        coin.tokens_sold = coin.tokens_sold.checked_sub(tokens).ok_or(FloorError::Overflow)?;
        coin.floor_reserve = coin.floor_reserve.checked_add(q.fee.pool).ok_or(FloorError::Overflow)?;
        (q.sol_net, q.fee)
    } else {
        let q = quote_pool.ok_or(FloorError::WrongPhase)?;
        move_lamports(v.sol_vault, v.fee_vault, q.fee.creator.checked_add(q.fee.protocol).ok_or(FloorError::Overflow)?)?;
        coin.pool_sol = q.after.sol;
        coin.pool_tok = q.after.tok;
        (q.sol_net, q.fee)
    };
    if let Some(dest) = sol_dest {
        move_lamports(v.sol_vault, dest, sol_net)?;
    }
    add_fees(coin, fee.creator, fee.protocol)?;
    coin.sell_count = coin.sell_count.saturating_add(1);
    coin.volume_sol = coin.volume_sol.saturating_add(sol_net);
    Ok((sol_net, fee))
}

/// Roll the brake window if it has elapsed and, if the queue is not empty,
/// fill it with the new window's allowance in one aggregate swap.
/// Returns `(filled, crank_reward_owed_to_cranker)`; the caller pays the
/// reward from `fee_vault` once no CPI involving the cranker remains.
fn settle_window<'info>(
    coin: &mut CoinState,
    v: &Venue<'_, 'info>,
    q: &QueueAccounts<'_, 'info>,
    cranker: &AccountInfo<'info>,
    supply: u64,
    crank_reward: u64,
    clock: &Clock,
) -> Result<(bool, u64)> {
    let p = coin.core_params();
    let ws = fc::window_start(coin.brake.window_start, p.brake_window_slots, clock.slot);
    if ws == coin.brake.window_start {
        return Ok((false, 0));
    }
    coin.brake.window_start = ws;
    let (s, t) = coin.reserves().or_err()?;
    coin.brake.ref_sol = s;
    coin.brake.ref_tok = t;
    if coin.brake.queued_total == 0 {
        return Ok((false, 0));
    }
    let budget = fc::brake_allowed(p.brake_drop_bps, s, t, s, t).or_err()?;
    let sold = budget.min(coin.brake.queued_total);
    if sold == 0 {
        return Ok((false, 0));
    }
    let closing_epoch = coin.brake.epoch;
    // A queue too small to be paid anything (rounding dust left behind by positions that
    // left) must not block every sell of the coin: sweep it into the venue for 0 SOL.
    let dust = matches!(quote_sell_net(coin, sold), Err(fc::CoreError::DustOutput));
    let (sol_net, fee) = if dust {
        token_transfer_from_coin(v.token_program, q.escrow, v.token_vault, v.coin_info, &coin.mint, coin.bumps.coin, sold)?;
        match coin.phase() {
            Phase::Curve => coin.tokens_sold = coin.tokens_sold.checked_sub(sold).ok_or(FloorError::Overflow)?,
            Phase::Graduated => coin.pool_tok = coin.pool_tok.checked_add(sold).ok_or(FloorError::Overflow)?,
        }
        (0, fc::FeeSplit::default())
    } else {
        execute_sell(coin, v, sold, q.escrow, Seller::Coin, Some(q.queue_sol_vault))?
    };
    let mut acc = coin.acc();
    let fill = acc.fill(sold, sol_net).or_err()?;
    coin.set_acc(acc);
    coin.brake.windows_processed = coin.brake.windows_processed.saturating_add(1);

    // Cranker reward: part of this swap's protocol fee, paid by the caller at the end.
    let reward = crank_reward.min(fee.protocol);
    coin.protocol_fees_owed = coin.protocol_fees_owed.checked_sub(reward).ok_or(FloorError::Overflow)?;

    if fill.closed_epoch {
        ensure_epoch_record(q.epoch_record, coin, closing_epoch, fill.final_sol_index, cranker, q.system_program)?;
    }
    emit_trade(coin, v.coin_info.key(), false, true, sol_net, sold, fee.total, fee.pool, supply, 0, clock)?;
    emit!(QueueProcessed {
        mint: coin.mint,
        caller: cranker.key(),
        epoch: closing_epoch,
        window_start: ws,
        sold,
        sol_out: sol_net,
        queued_after: coin.brake.queued_total,
        closed_epoch: fill.closed_epoch,
        crank_reward: reward,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    if fill.closed_epoch {
        emit!(BrakeReleased { mint: coin.mint, epoch: closing_epoch, reason: 0, slot: clock.slot, timestamp: clock.unix_timestamp });
    }
    Ok((true, reward))
}

/// Create (if needed) and finalize the record of a closed epoch.
fn ensure_epoch_record<'info>(
    record: &AccountInfo<'info>,
    coin: &CoinState,
    epoch: u32,
    final_sol_index: u128,
    payer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
) -> Result<()> {
    let coin_key = Pubkey::find_program_address(&[SEED_COIN, coin.mint.as_ref()], &crate::ID).0;
    let (expected, bump) = Pubkey::find_program_address(&[SEED_EPOCH, coin_key.as_ref(), &epoch.to_le_bytes()], &crate::ID);
    require_keys_eq!(record.key(), expected, FloorError::EpochRecordMismatch);
    if record.data_is_empty() {
        create_pda_account(payer, record, system_program, 8 + EpochRecord::INIT_SPACE, &[SEED_EPOCH, coin_key.as_ref(), &epoch.to_le_bytes(), &[bump]])?;
    } else {
        let existing: EpochRecord = read_account(record)?;
        require!(!existing.closed && existing.epoch == epoch, FloorError::EpochRecordMismatch);
    }
    write_account(record, &EpochRecord { coin: coin_key, epoch, closed: true, final_sol_index, bump })
}

/// Settle a position: live epoch → remove it from the accumulator; closed
/// epoch → read the final index. Returns `(tokens_remaining, sol_owed)`.
fn settle_position(coin: &mut CoinState, pos: &fc::QueuePosition, epoch_record: &AccountInfo) -> Result<(u64, u64)> {
    if pos.epoch == coin.brake.epoch {
        let mut acc = coin.acc();
        let r = acc.leave(pos).or_err()?;
        coin.set_acc(acc);
        Ok(r)
    } else {
        let coin_key = Pubkey::find_program_address(&[SEED_COIN, coin.mint.as_ref()], &crate::ID).0;
        let rec: EpochRecord = read_account(epoch_record)?;
        require!(rec.closed && rec.epoch == pos.epoch && rec.coin == coin_key, FloorError::EpochRecordMismatch);
        Ok((0, fc::entry_owed(pos, rec.final_sol_index).or_err()?))
    }
}

/// Net SOL a sale of `tokens` would pay right now, by phase.
fn quote_sell_net(coin: &CoinState, tokens: u64) -> fc::CoreResult<u64> {
    let p = coin.core_params();
    match coin.phase() {
        Phase::Curve => fc::curve_sell(&p, &coin.curve(), tokens).map(|q| q.sol_net),
        Phase::Graduated => fc::pool_sell(&p, &coin.pool(), tokens).map(|q| q.sol_net),
    }
}

/// Shared body of `sell` and `swap_sell`.
fn sell_common<'info>(
    coin: &mut CoinState,
    v: &Venue<'_, 'info>,
    q: &QueueAccounts<'_, 'info>,
    user: &AccountInfo<'info>,
    user_token: &AccountInfo<'info>,
    entry_info: &AccountInfo<'info>,
    entry_bump: u8,
    supply: u64,
    crank_reward: u64,
    tokens_in: u64,
    min_sol_out: u64,
    queue_remainder: bool,
) -> Result<()> {
    require!(tokens_in > 0, FloorError::ZeroAmount);
    let clock = Clock::get()?;
    let p = coin.core_params();

    // 1. The queue is served first for a new window (the seller is the cranker).
    let (_, reward) = settle_window(coin, v, q, user, supply, crank_reward, &clock)?;

    // 2. How much of this order fits under the brake right now.
    let (s, t) = coin.reserves().or_err()?;
    let allowed = fc::brake_allowed(p.brake_drop_bps, coin.brake.ref_sol, coin.brake.ref_tok, s, t).or_err()?;
    let mut exec = tokens_in.min(allowed);
    // A dust-sized executable part (pays nothing) is not worth a trade: queue it all instead.
    if exec > 0 && matches!(quote_sell_net(coin, exec), Err(fc::CoreError::DustOutput)) {
        exec = 0;
    }
    let rest = tokens_in.checked_sub(exec).ok_or(FloorError::Overflow)?;
    let queued_remainder = if queue_remainder { rest } else { 0 };
    require!(exec > 0 || queued_remainder > 0, FloorError::SlippageExceeded);

    // 3. Execute what fits (tokens in now, SOL paid at the end).
    let mut sol_net = 0u64;
    let mut exec_fee = fc::FeeSplit::default();
    if exec > 0 {
        let (net, fee) = execute_sell(coin, v, exec, user_token, Seller::User(user), None)?;
        sol_net = net;
        exec_fee = fee;
        // price limit, pro rata of the executed part: sol_net / exec >= min_sol_out / tokens_in
        require!(
            u128::from(sol_net) * u128::from(tokens_in) >= u128::from(min_sol_out) * u128::from(exec),
            FloorError::SlippageExceeded
        );
    }

    // 4. Queue the rest.
    let mut owed = 0u64;
    if queued_remainder > 0 {
        token_transfer_from_user(v.token_program, user_token, q.escrow, user, rest)?;
        let was_engaged = coin.brake.queued_total > 0;
        owed = join_queue(coin, q, entry_info, entry_bump, user, rest, &clock)?;
        if !was_engaged {
            coin.brake.engagements = coin.brake.engagements.saturating_add(1);
            emit!(BrakeEngaged {
                mint: coin.mint,
                window_start: coin.brake.window_start,
                ref_sol: coin.brake.ref_sol,
                ref_tok: coin.brake.ref_tok,
                queued_total: coin.brake.queued_total,
                epoch: coin.brake.epoch,
                slot: clock.slot,
                timestamp: clock.unix_timestamp,
            });
        }
    }

    // The seller's Trade is emitted after the queue join so its `queued` already counts the remainder.
    if exec > 0 {
        emit_trade(coin, user.key(), false, false, sol_net, exec, exec_fee.total, exec_fee.pool, supply, queued_remainder, &clock)?;
    }

    // 5. Pay the seller: executed part, crank reward, SOL earned by an existing position.
    move_lamports(v.sol_vault, user, sol_net)?;
    move_lamports(v.fee_vault, user, reward)?;
    move_lamports(q.queue_sol_vault, user, owed)?;
    Ok(())
}

/// Add `amount` tokens (already moved to the escrow) to the user's queue
/// position, creating or merging it. Returns the SOL already earned by an
/// existing position, to be paid by the caller.
fn join_queue<'info>(
    coin: &mut CoinState,
    q: &QueueAccounts<'_, 'info>,
    entry_info: &AccountInfo<'info>,
    entry_bump: u8,
    user: &AccountInfo<'info>,
    amount: u64,
    clock: &Clock,
) -> Result<u64> {
    let coin_key = Pubkey::find_program_address(&[SEED_COIN, coin.mint.as_ref()], &crate::ID).0;
    let mut acc = coin.acc();
    let mut carried = 0u64;
    let mut owed = 0u64;
    if entry_info.data_is_empty() {
        create_pda_account(
            user,
            entry_info,
            q.system_program,
            8 + QueueEntry::INIT_SPACE,
            &[SEED_QUEUE_ENTRY, coin_key.as_ref(), user.key.as_ref(), &[entry_bump]],
        )?;
    } else {
        let existing: QueueEntry = read_account(entry_info)?;
        require!(existing.owner == user.key() && existing.coin == coin_key, FloorError::QueueEntryMismatch);
        let pos = existing.position();
        if pos.epoch == acc.epoch {
            let (r, o) = acc.leave(&pos).or_err()?;
            carried = r;
            owed = o;
        } else {
            // The entry's epoch must be the one that just closed in this very
            // instruction (its record is the one we hold); anything older is settled separately.
            // Records only exist for closed epochs, so an empty account means the entry is stale.
            require!(!q.epoch_record.data_is_empty(), FloorError::StaleQueueEntry);
            let rec: EpochRecord = read_account(q.epoch_record)?;
            require!(rec.closed && rec.epoch == pos.epoch && rec.coin == coin_key, FloorError::StaleQueueEntry);
            owed = fc::entry_owed(&pos, rec.final_sol_index).or_err()?;
        }
    }
    let total = carried.checked_add(amount).ok_or(FloorError::Overflow)?;
    let pos = acc.join(total).or_err()?;
    coin.set_acc(acc);
    write_account(
        entry_info,
        &QueueEntry {
            coin: coin_key,
            owner: user.key(),
            epoch: pos.epoch,
            shares: pos.shares,
            sol_index_at_join: pos.sol_index_at_join,
            joined_slot: clock.slot,
            amount_queued: total,
            bump: entry_bump,
        },
    )?;
    emit!(QueueJoined { mint: coin.mint, user: user.key(), amount, queued_total: coin.brake.queued_total, epoch: pos.epoch, slot: clock.slot, timestamp: clock.unix_timestamp });
    Ok(owed)
}

fn emit_trade(
    coin: &CoinState,
    user: Pubkey,
    is_buy: bool,
    is_queue_fill: bool,
    sol_amount: u64,
    token_amount: u64,
    fee_total: u64,
    fee_to_floor: u64,
    supply: u64,
    queued_remainder: u64,
    clock: &Clock,
) -> Result<()> {
    let (sol_reserves, token_reserves) = coin.reserves().or_err()?;
    emit!(Trade {
        mint: coin.mint,
        user,
        is_buy,
        phase: coin.phase,
        is_queue_fill,
        sol_amount,
        token_amount,
        fee_total,
        fee_to_floor,
        sol_reserves,
        token_reserves,
        real_sol: coin.real_sol,
        tokens_sold: coin.tokens_sold,
        floor_reserve: coin.floor_reserve,
        pool_sol: coin.pool_sol,
        pool_tok: coin.pool_tok,
        queued: coin.brake.queued_total,
        supply,
        queued_remainder,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}
