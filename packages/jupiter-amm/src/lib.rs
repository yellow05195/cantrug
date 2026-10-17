//! Jupiter integration for FLOORED pools.
//!
//! Implements [`jupiter_amm_interface::Amm`] for a graduated coin: Jupiter's
//! router discovers the `CoinState` account (the "market"), refreshes it, asks
//! for quotes, and asks which accounts to pass to the program's native
//! `swap_buy` / `swap_sell` instructions.
//!
//! Quotes are computed by `floored-core`, the same crate the on-chain program
//! links, so they are exact to the lamport. The brake is modelled: a sell that
//! would exceed the current window's allowance is quoted on the executable
//! part only (`in_amount` = executed), and `swap_sell_data` always sets
//! `queue_remainder = false`, so a router never leaves tokens in the queue and
//! execution matches the quote exactly (proved by `tests/parity.rs` against
//! the built program in LiteSVM).
//!
//! FLOORED pools hold native SOL. Jupiter routes such venues through its
//! "Wrapped" swap variants (as for Pump, Moonshot and Boop): its own program
//! unwraps WSOL before the CPI and wraps the SOL received after it, so no
//! WSOL adapter exists on-chain. See docs/jupiter-listing.md.

use anyhow::{anyhow, Result};
use floored_core as fc;
use jupiter_amm_interface::{
    AccountMap, Amm, AmmContext, KeyedAccount, Quote, QuoteParams, Swap, SwapAndAccountMetas, SwapMode, SwapParams,
};
use rust_decimal::Decimal;
use sha2::{Digest, Sha256};
use solana_instruction::AccountMeta;
use solana_pubkey::{pubkey, Pubkey};

pub const PROGRAM_ID: Pubkey = pubkey!("E7ZbamLD8wenjjHitR8bUHwuNKA4Em39sqybnhk3nc87");
pub const WSOL: Pubkey = pubkey!("So11111111111111111111111111111111111111112");
pub const TOKEN_PROGRAM: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const ATA_PROGRAM: Pubkey = pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
pub const SYSTEM_PROGRAM: Pubkey = pubkey!("11111111111111111111111111111111");

const SEED_CONFIG: &[u8] = b"config";
const SEED_POOL_SOL: &[u8] = b"pool_sol";
const SEED_FEE_VAULT: &[u8] = b"fees";
const SEED_QUEUE_SOL: &[u8] = b"queue_sol";
const SEED_POOL_TOKENS: &[u8] = b"pool_tokens";
const SEED_QUEUE_ESCROW: &[u8] = b"queue_escrow";
const SEED_QUEUE_ENTRY: &[u8] = b"queue";
const SEED_EPOCH: &[u8] = b"epoch";

/// Minimal decoder of the on-chain `CoinState` (Anchor account, borsh).
#[derive(Clone, Debug, Default)]
pub struct CoinState {
    pub mint: Pubkey,
    pub params: fc::Params,
    pub phase: u8,
    pub pool_sol: u64,
    pub pool_tok: u64,
    pub ref_sol: u64,
    pub ref_tok: u64,
    pub window_start: u64,
    pub epoch: u32,
    pub queued_total: u64,
}

fn rd_u64(d: &[u8], o: &mut usize) -> Result<u64> {
    let v = u64::from_le_bytes(d.get(*o..*o + 8).ok_or(anyhow!("short account"))?.try_into()?);
    *o += 8;
    Ok(v)
}
fn rd_u32(d: &[u8], o: &mut usize) -> Result<u32> {
    let v = u32::from_le_bytes(d.get(*o..*o + 4).ok_or(anyhow!("short account"))?.try_into()?);
    *o += 4;
    Ok(v)
}
fn rd_u16(d: &[u8], o: &mut usize) -> Result<u16> {
    let v = u16::from_le_bytes(d.get(*o..*o + 2).ok_or(anyhow!("short account"))?.try_into()?);
    *o += 2;
    Ok(v)
}
fn rd_pk(d: &[u8], o: &mut usize) -> Result<Pubkey> {
    let v = Pubkey::new_from_array(d.get(*o..*o + 32).ok_or(anyhow!("short account"))?.try_into()?);
    *o += 32;
    Ok(v)
}

impl CoinState {
    pub fn decode(data: &[u8]) -> Result<CoinState> {
        let disc: [u8; 8] = Sha256::digest(b"account:CoinState")[..8].try_into()?;
        if data.len() < 8 || data[..8] != disc {
            return Err(anyhow!("not a CoinState account"));
        }
        let mut o = 8;
        let mint = rd_pk(data, &mut o)?;
        let _creator = rd_pk(data, &mut o)?;
        let params = fc::Params {
            virtual_sol: rd_u64(data, &mut o)?,
            virtual_tok: rd_u64(data, &mut o)?,
            curve_supply: rd_u64(data, &mut o)?,
            graduation_sol: rd_u64(data, &mut o)?,
            curve_fee_bps: rd_u16(data, &mut o)?,
            curve_fee_creator_share_bps: rd_u16(data, &mut o)?,
            curve_fee_protocol_share_bps: rd_u16(data, &mut o)?,
            pool_fee_bps: rd_u16(data, &mut o)?,
            pool_fee_pool_share_bps: rd_u16(data, &mut o)?,
            pool_fee_creator_share_bps: rd_u16(data, &mut o)?,
            redeem_fee_bps: rd_u16(data, &mut o)?,
            brake_drop_bps: rd_u16(data, &mut o)?,
            brake_window_slots: rd_u64(data, &mut o)?,
        };
        let phase = *data.get(o).ok_or(anyhow!("short"))?;
        o += 1;
        let _real_sol = rd_u64(data, &mut o)?;
        let _tokens_sold = rd_u64(data, &mut o)?;
        let _floor_reserve = rd_u64(data, &mut o)?;
        let pool_sol = rd_u64(data, &mut o)?;
        let pool_tok = rd_u64(data, &mut o)?;
        // fees (4) + stats (6)
        for _ in 0..10 {
            rd_u64(data, &mut o)?;
        }
        // brake
        let ref_sol = rd_u64(data, &mut o)?;
        let ref_tok = rd_u64(data, &mut o)?;
        let window_start = rd_u64(data, &mut o)?;
        let epoch = rd_u32(data, &mut o)?;
        o += 16 + 16; // scale, sol_index
        let queued_total = rd_u64(data, &mut o)?;
        Ok(CoinState { mint, params, phase, pool_sol, pool_tok, ref_sol, ref_tok, window_start, epoch, queued_total })
    }
}

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &PROGRAM_ID).0
}

fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[owner.as_ref(), TOKEN_PROGRAM.as_ref(), mint.as_ref()], &ATA_PROGRAM).0
}

fn discriminator(name: &str) -> [u8; 8] {
    Sha256::digest(format!("global:{name}").as_bytes())[..8].try_into().unwrap()
}

/// One FLOORED pool as seen by Jupiter.
#[derive(Clone, Debug)]
pub struct FlooredAmm {
    pub key: Pubkey,
    pub state: CoinState,
    pub slot: u64,
}

impl FlooredAmm {
    fn coin_key(&self) -> Pubkey {
        self.key
    }
    fn pool_sol_vault(&self) -> Pubkey {
        pda(&[SEED_POOL_SOL, self.key.as_ref()])
    }
    fn pool_token_vault(&self) -> Pubkey {
        pda(&[SEED_POOL_TOKENS, self.key.as_ref()])
    }
    fn fee_vault(&self) -> Pubkey {
        pda(&[SEED_FEE_VAULT, self.key.as_ref()])
    }
    fn queue_sol_vault(&self) -> Pubkey {
        pda(&[SEED_QUEUE_SOL, self.key.as_ref()])
    }
    fn queue_escrow(&self) -> Pubkey {
        pda(&[SEED_QUEUE_ESCROW, self.key.as_ref()])
    }

    /// Tokens a sell may execute right now under the brake (window roll modelled).
    pub fn sell_allowance(&self) -> u64 {
        let p = &self.state.params;
        let (s, t) = (self.state.pool_sol, self.state.pool_tok);
        let ws = fc::window_start(self.state.window_start, p.brake_window_slots, self.slot);
        let (ref_s, ref_t) = if ws != self.state.window_start { (s, t) } else { (self.state.ref_sol, self.state.ref_tok) };
        fc::brake_allowed(p.brake_drop_bps, ref_s, ref_t, s, t).unwrap_or(0)
    }

    pub fn discriminators() -> (Vec<u8>, Vec<u8>) {
        (discriminator("swap_buy").to_vec(), discriminator("swap_sell").to_vec())
    }

    /// Instruction data of `swap_buy(sol_in, min_tokens_out)`.
    pub fn swap_buy_data(sol_in: u64, min_tokens_out: u64) -> Vec<u8> {
        let mut d = discriminator("swap_buy").to_vec();
        d.extend_from_slice(&sol_in.to_le_bytes());
        d.extend_from_slice(&min_tokens_out.to_le_bytes());
        d
    }

    /// Instruction data of `swap_sell(tokens_in, min_sol_out, queue_remainder = false)`:
    /// a router sells what the brake allows and keeps the rest in the wallet.
    pub fn swap_sell_data(tokens_in: u64, min_sol_out: u64) -> Vec<u8> {
        let mut d = discriminator("swap_sell").to_vec();
        d.extend_from_slice(&tokens_in.to_le_bytes());
        d.extend_from_slice(&min_sol_out.to_le_bytes());
        d.push(0);
        d
    }

    /// Current queue epoch (seed of the `epoch_record` account `swap_sell` expects).
    pub fn epoch(&self) -> u32 {
        self.state.epoch
    }
}

impl Amm for FlooredAmm {
    fn from_keyed_account(keyed_account: &KeyedAccount, amm_context: &AmmContext) -> Result<Self> {
        let state = CoinState::decode(&keyed_account.account.data)?;
        if state.phase != 1 {
            return Err(anyhow!("coin has not graduated: no pool yet"));
        }
        Ok(FlooredAmm { key: keyed_account.key, state, slot: amm_context.clock_ref.slot.load(std::sync::atomic::Ordering::Relaxed) })
    }

    fn label(&self) -> String {
        "FLOORED".to_string()
    }

    fn program_id(&self) -> Pubkey {
        PROGRAM_ID
    }

    fn key(&self) -> Pubkey {
        self.key
    }

    fn get_reserve_mints(&self) -> Vec<Pubkey> {
        vec![WSOL, self.state.mint]
    }

    fn get_accounts_to_update(&self) -> Vec<Pubkey> {
        vec![self.key]
    }

    fn update(&mut self, account_map: &AccountMap) -> Result<()> {
        let data = jupiter_amm_interface::try_get_account_data(account_map, &self.key)?;
        self.state = CoinState::decode(data)?;
        Ok(())
    }

    fn quote(&self, q: &QuoteParams) -> Result<Quote> {
        if q.swap_mode != SwapMode::ExactIn {
            return Err(anyhow!("exact-out not supported"));
        }
        let p = &self.state.params;
        let pool = fc::PoolState { sol: self.state.pool_sol, tok: self.state.pool_tok };
        if q.input_mint == WSOL && q.output_mint == self.state.mint {
            let r = fc::pool_buy(p, &pool, q.amount).map_err(|e| anyhow!("{e:?}"))?;
            Ok(Quote {
                in_amount: q.amount,
                out_amount: r.tokens_out,
                fee_amount: r.fee.total,
                fee_mint: WSOL,
                fee_pct: Decimal::new(p.pool_fee_bps as i64, 4),
            })
        } else if q.input_mint == self.state.mint && q.output_mint == WSOL {
            let exec = q.amount.min(self.sell_allowance());
            if exec == 0 {
                return Err(anyhow!("brake: no sell allowance in this window"));
            }
            let r = fc::pool_sell(p, &pool, exec).map_err(|e| anyhow!("{e:?}"))?;
            Ok(Quote {
                in_amount: exec,
                out_amount: r.sol_net,
                fee_amount: r.fee.total,
                fee_mint: WSOL,
                fee_pct: Decimal::new(p.pool_fee_bps as i64, 4),
            })
        } else {
            Err(anyhow!("unsupported pair"))
        }
    }

    fn get_swap_and_account_metas(&self, s: &SwapParams) -> Result<SwapAndAccountMetas> {
        let coin = self.coin_key();
        let user = s.user;
        let mint = self.state.mint;
        let user_token = ata(&user, &mint);
        let metas = if s.source_mint == WSOL {
            // swap_buy: [user, coin, mint, pool_sol_vault, fee_vault, pool_token_vault, user_token, token, ata, system]
            vec![
                AccountMeta::new(user, true),
                AccountMeta::new(coin, false),
                AccountMeta::new_readonly(mint, false),
                AccountMeta::new(self.pool_sol_vault(), false),
                AccountMeta::new(self.fee_vault(), false),
                AccountMeta::new(self.pool_token_vault(), false),
                AccountMeta::new(user_token, false),
                AccountMeta::new_readonly(TOKEN_PROGRAM, false),
                AccountMeta::new_readonly(ATA_PROGRAM, false),
                AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
            ]
        } else {
            // swap_sell: [user, config, coin, mint, pool_sol_vault, fee_vault, queue_sol_vault, pool_token_vault,
            //             queue_escrow, user_token, queue_entry, epoch_record, token, system]
            vec![
                AccountMeta::new(user, true),
                AccountMeta::new_readonly(pda(&[SEED_CONFIG]), false),
                AccountMeta::new(coin, false),
                AccountMeta::new_readonly(mint, false),
                AccountMeta::new(self.pool_sol_vault(), false),
                AccountMeta::new(self.fee_vault(), false),
                AccountMeta::new(self.queue_sol_vault(), false),
                AccountMeta::new(self.pool_token_vault(), false),
                AccountMeta::new(self.queue_escrow(), false),
                AccountMeta::new(user_token, false),
                AccountMeta::new(pda(&[SEED_QUEUE_ENTRY, coin.as_ref(), user.as_ref()]), false),
                AccountMeta::new(pda(&[SEED_EPOCH, coin.as_ref(), &self.state.epoch.to_le_bytes()]), false),
                AccountMeta::new_readonly(TOKEN_PROGRAM, false),
                AccountMeta::new_readonly(SYSTEM_PROGRAM, false),
            ]
        };
        // `Swap` has no FLOORED variant yet: Jupiter adds `FlooredWrappedBuy` /
        // `FlooredWrappedSell` when the DEX is listed (docs/jupiter-listing.md).
        // `TokenSwap` is a placeholder so the crate compiles against the published interface.
        Ok(SwapAndAccountMetas { swap: Swap::TokenSwap, account_metas: metas })
    }

    fn clone_amm(&self) -> Box<dyn Amm + Send + Sync> {
        Box::new(self.clone())
    }

    fn get_accounts_len(&self) -> usize {
        14
    }

    fn supports_exact_out(&self) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discriminators_match_anchor() {
        let (b, s) = FlooredAmm::discriminators();
        assert_eq!(b.len(), 8);
        assert_ne!(b, s);
    }

    #[test]
    fn quotes_follow_core() {
        let p = fc::Params::DEFAULT;
        let amm = FlooredAmm {
            key: Pubkey::new_unique(),
            state: CoinState {
                mint: Pubkey::new_unique(),
                params: p,
                phase: 1,
                pool_sol: 85_000_000_000,
                pool_tok: 206_900_000_000_000,
                ref_sol: 85_000_000_000,
                ref_tok: 206_900_000_000_000,
                window_start: 0,
                epoch: 0,
                queued_total: 0,
            },
            slot: 0,
        };
        let q = amm
            .quote(&QuoteParams {
                amount: 1_000_000_000,
                input_mint: WSOL,
                output_mint: amm.state.mint,
                swap_mode: SwapMode::ExactIn,
                fee_mode: Default::default(),
            })
            .unwrap();
        let core = fc::pool_buy(&p, &fc::PoolState { sol: 85_000_000_000, tok: 206_900_000_000_000 }, 1_000_000_000).unwrap();
        assert_eq!(q.out_amount, core.tokens_out);
        // a sell bigger than the window allowance is quoted on the executable part only
        let big = amm
            .quote(&QuoteParams {
                amount: 100_000_000_000_000,
                input_mint: amm.state.mint,
                output_mint: WSOL,
                swap_mode: SwapMode::ExactIn,
                fee_mode: Default::default(),
            })
            .unwrap();
        assert!(big.in_amount < 100_000_000_000_000);
        assert_eq!(big.in_amount, amm.sell_allowance());
    }
}
