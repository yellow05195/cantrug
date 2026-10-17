//! In-process integration-test harness for the FLOORED program.
//!
//! `programs/floored/target/deploy/floored.so` runs inside LiteSVM together
//! with the Metaplex Token Metadata program (mainnet bytecode in
//! `fixtures/`). Instructions are built by hand in IDL account order with
//! Anchor's 8-byte discriminators; accounts are decoded with the program's
//! own types.
//!
//! Shadow model: every successful operation is replayed on `floored_core`
//! and `Chain::assert_mirror` checks that the on-chain `CoinState` and the
//! lamport balances of every vault are IDENTICAL to the model.

pub mod fuzz;

use std::path::PathBuf;

pub use litesvm::types::{FailedTransactionMetadata, TransactionMetadata};
pub use litesvm::LiteSVM;
pub use solana_address::{address, Address as Pubkey};
pub use solana_instruction::{AccountMeta, Instruction};
pub use solana_keypair::Keypair;
pub use solana_signer::Signer;

pub use floored::{CoinParams, CoinState, EpochRecord, GlobalConfig, QueueEntry};
pub use floored_core as core;

use anchor_lang::{AccountDeserialize, Space};
use sha2::{Digest, Sha256};
use solana_account::Account;
use solana_clock::Clock;
use solana_compute_budget_interface::ComputeBudgetInstruction;
use solana_program_pack::Pack;
use solana_transaction::Transaction;
use spl_associated_token_account_interface::address::get_associated_token_address;

pub type TxResult = Result<TransactionMetadata, FailedTransactionMetadata>;

pub fn pk(p: &anchor_lang::prelude::Pubkey) -> Pubkey {
    Pubkey::new_from_array(p.to_bytes())
}

pub const PROGRAM_ID: Pubkey = address!("E7ZbamLD8wenjjHitR8bUHwuNKA4Em39sqybnhk3nc87");
pub const SYSTEM_ID: Pubkey = solana_system_interface::program::ID;
pub const TOKEN_ID: Pubkey = spl_token_interface::ID;
pub const ATA_ID: Pubkey = spl_associated_token_account_interface::program::ID;
pub const METADATA_ID: Pubkey = address!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
pub const RENT_SYSVAR: Pubkey = address!("SysvarRent111111111111111111111111111111111");

pub const SOL: u64 = 1_000_000_000;
pub const SIG_FEE: u64 = 5_000;
pub const CRANK_REWARD: u64 = 2_000_000;
pub const CREATE_FEE: u64 = 20_000_000;
pub const P: core::Params = core::Params::DEFAULT;
pub const WINDOW: u64 = 150;

pub fn tok(n: u64) -> u64 {
    n * 1_000_000
}

// ───────────────────────────── PDAs ─────────────────────────────

pub fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &PROGRAM_ID).0
}
pub fn config_pda() -> Pubkey {
    pda(&[floored::SEED_CONFIG])
}
pub fn coin_pda(mint: &Pubkey) -> Pubkey {
    pda(&[floored::SEED_COIN, mint.as_ref()])
}
pub fn queue_entry_pda(coin: &Pubkey, owner: &Pubkey) -> Pubkey {
    pda(&[floored::SEED_QUEUE_ENTRY, coin.as_ref(), owner.as_ref()])
}
pub fn epoch_record_pda(coin: &Pubkey, epoch: u32) -> Pubkey {
    pda(&[floored::SEED_EPOCH, coin.as_ref(), &epoch.to_le_bytes()])
}
pub fn metadata_pda(mint: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"metadata", METADATA_ID.as_ref(), mint.as_ref()], &METADATA_ID).0
}
pub fn ata(owner: &Pubkey, mint: &Pubkey) -> Pubkey {
    get_associated_token_address(owner, mint)
}

/// Every PDA of one coin.
#[derive(Clone, Copy, Debug)]
pub struct CoinKeys {
    pub mint: Pubkey,
    pub coin: Pubkey,
    pub curve_vault: Pubkey,
    pub floor_reserve: Pubkey,
    pub pool_sol_vault: Pubkey,
    pub fee_vault: Pubkey,
    pub queue_sol_vault: Pubkey,
    pub curve_token_vault: Pubkey,
    pub pool_token_vault: Pubkey,
    pub queue_escrow: Pubkey,
    pub metadata: Pubkey,
}

impl CoinKeys {
    pub fn new(mint: Pubkey) -> CoinKeys {
        let coin = coin_pda(&mint);
        let c = coin.as_ref();
        CoinKeys {
            mint,
            coin,
            curve_vault: pda(&[floored::SEED_CURVE_VAULT, c]),
            floor_reserve: pda(&[floored::SEED_FLOOR_RESERVE, c]),
            pool_sol_vault: pda(&[floored::SEED_POOL_SOL, c]),
            fee_vault: pda(&[floored::SEED_FEE_VAULT, c]),
            queue_sol_vault: pda(&[floored::SEED_QUEUE_SOL, c]),
            curve_token_vault: pda(&[floored::SEED_CURVE_TOKENS, c]),
            pool_token_vault: pda(&[floored::SEED_POOL_TOKENS, c]),
            queue_escrow: pda(&[floored::SEED_QUEUE_ESCROW, c]),
            metadata: metadata_pda(&mint),
        }
    }
}

// ───────────────────────────── encoding ─────────────────────────────

pub fn discriminator(ns: &str, name: &str) -> [u8; 8] {
    let h = Sha256::digest(format!("{ns}:{name}").as_bytes());
    h[..8].try_into().unwrap()
}
fn data(name: &str, args: &[&[u8]]) -> Vec<u8> {
    let mut v = discriminator("global", name).to_vec();
    for a in args {
        v.extend_from_slice(a);
    }
    v
}
pub fn borsh_string(s: &str) -> Vec<u8> {
    let mut v = (s.len() as u32).to_le_bytes().to_vec();
    v.extend_from_slice(s.as_bytes());
    v
}
pub fn borsh_params(p: &core::Params) -> Vec<u8> {
    let mut v = Vec::new();
    v.extend_from_slice(&p.virtual_sol.to_le_bytes());
    v.extend_from_slice(&p.virtual_tok.to_le_bytes());
    v.extend_from_slice(&p.curve_supply.to_le_bytes());
    v.extend_from_slice(&p.graduation_sol.to_le_bytes());
    for x in [
        p.curve_fee_bps,
        p.curve_fee_creator_share_bps,
        p.curve_fee_protocol_share_bps,
        p.pool_fee_bps,
        p.pool_fee_pool_share_bps,
        p.pool_fee_creator_share_bps,
        p.redeem_fee_bps,
        p.brake_drop_bps,
    ] {
        v.extend_from_slice(&x.to_le_bytes());
    }
    v.extend_from_slice(&p.brake_window_slots.to_le_bytes());
    v
}
pub fn w(k: Pubkey) -> AccountMeta {
    AccountMeta::new(k, false)
}
pub fn r(k: Pubkey) -> AccountMeta {
    AccountMeta::new_readonly(k, false)
}
pub fn ws(k: Pubkey) -> AccountMeta {
    AccountMeta::new(k, true)
}
pub fn rs(k: Pubkey) -> AccountMeta {
    AccountMeta::new_readonly(k, true)
}
fn ix(accounts: Vec<AccountMeta>, data: Vec<u8>) -> Instruction {
    Instruction { program_id: PROGRAM_ID, accounts, data }
}

// ───────────────────────────── instruction builders (IDL account order) ─────────────────────────────

pub fn ix_initialize(authority: Pubkey, params: &core::Params, crank_reward: u64, create_fee: u64, recipient: Pubkey) -> Instruction {
    ix(
        vec![ws(authority), w(config_pda()), r(SYSTEM_ID)],
        data("initialize", &[&borsh_params(params), &crank_reward.to_le_bytes(), &create_fee.to_le_bytes(), recipient.as_ref()]),
    )
}

pub fn ix_update_config(authority: Pubkey, params: Option<&core::Params>, crank_reward: Option<u64>, create_fee: Option<u64>, recipient: Option<Pubkey>, new_authority: Option<Pubkey>) -> Instruction {
    let mut d = Vec::new();
    match params {
        Some(p) => {
            d.push(1);
            d.extend(borsh_params(p));
        }
        None => d.push(0),
    }
    for o in [crank_reward, create_fee] {
        match o {
            Some(v) => {
                d.push(1);
                d.extend_from_slice(&v.to_le_bytes());
            }
            None => d.push(0),
        }
    }
    for o in [recipient, new_authority] {
        match o {
            Some(k) => {
                d.push(1);
                d.extend_from_slice(k.as_ref());
            }
            None => d.push(0),
        }
    }
    ix(vec![rs(authority), w(config_pda())], data("update_config", &[&d]))
}

pub fn ix_create_coin(creator: Pubkey, recipient: Pubkey, k: &CoinKeys, name: &str, symbol: &str, uri: &str) -> Instruction {
    ix(
        vec![
            ws(creator),
            w(config_pda()),
            w(recipient),
            w(k.coin),
            ws(k.mint),
            w(k.curve_vault),
            w(k.floor_reserve),
            w(k.pool_sol_vault),
            w(k.fee_vault),
            w(k.queue_sol_vault),
            w(k.curve_token_vault),
            w(k.pool_token_vault),
            w(k.queue_escrow),
            w(k.metadata),
            r(METADATA_ID),
            r(TOKEN_ID),
            r(SYSTEM_ID),
            r(RENT_SYSVAR),
        ],
        data("create_coin", &[&borsh_string(name), &borsh_string(symbol), &borsh_string(uri)]),
    )
}

pub fn ix_buy(k: &CoinKeys, user: Pubkey, sol_max: u64, min_out: u64) -> Instruction {
    ix(
        vec![
            ws(user),
            w(k.coin),
            r(k.mint),
            w(k.curve_vault),
            w(k.floor_reserve),
            w(k.fee_vault),
            w(k.curve_token_vault),
            w(ata(&user, &k.mint)),
            r(TOKEN_ID),
            r(ATA_ID),
            r(SYSTEM_ID),
        ],
        data("buy", &[&sol_max.to_le_bytes(), &min_out.to_le_bytes()]),
    )
}

pub fn ix_sell(k: &CoinKeys, user: Pubkey, epoch: u32, tokens: u64, min_out: u64, queue_remainder: bool) -> Instruction {
    ix(
        vec![
            ws(user),
            r(config_pda()),
            w(k.coin),
            r(k.mint),
            w(k.curve_vault),
            w(k.floor_reserve),
            w(k.fee_vault),
            w(k.queue_sol_vault),
            w(k.curve_token_vault),
            w(k.queue_escrow),
            w(ata(&user, &k.mint)),
            w(queue_entry_pda(&k.coin, &user)),
            w(epoch_record_pda(&k.coin, epoch)),
            r(TOKEN_ID),
            r(SYSTEM_ID),
        ],
        data("sell", &[&tokens.to_le_bytes(), &min_out.to_le_bytes(), &[queue_remainder as u8]]),
    )
}

pub fn ix_graduate(k: &CoinKeys, caller: Pubkey) -> Instruction {
    ix(
        vec![
            ws(caller),
            w(config_pda()),
            w(k.coin),
            r(k.mint),
            w(k.curve_vault),
            w(k.floor_reserve),
            w(k.pool_sol_vault),
            w(k.fee_vault),
            w(k.curve_token_vault),
            w(k.pool_token_vault),
            r(TOKEN_ID),
        ],
        data("graduate", &[]),
    )
}

pub fn ix_swap_buy(k: &CoinKeys, user: Pubkey, sol_in: u64, min_out: u64) -> Instruction {
    ix(
        vec![
            ws(user),
            w(k.coin),
            r(k.mint),
            w(k.pool_sol_vault),
            w(k.fee_vault),
            w(k.pool_token_vault),
            w(ata(&user, &k.mint)),
            r(TOKEN_ID),
            r(ATA_ID),
            r(SYSTEM_ID),
        ],
        data("swap_buy", &[&sol_in.to_le_bytes(), &min_out.to_le_bytes()]),
    )
}

pub fn ix_swap_sell(k: &CoinKeys, user: Pubkey, epoch: u32, tokens: u64, min_out: u64, queue_remainder: bool) -> Instruction {
    ix(
        vec![
            ws(user),
            r(config_pda()),
            w(k.coin),
            r(k.mint),
            w(k.pool_sol_vault),
            w(k.fee_vault),
            w(k.queue_sol_vault),
            w(k.pool_token_vault),
            w(k.queue_escrow),
            w(ata(&user, &k.mint)),
            w(queue_entry_pda(&k.coin, &user)),
            w(epoch_record_pda(&k.coin, epoch)),
            r(TOKEN_ID),
            r(SYSTEM_ID),
        ],
        data("swap_sell", &[&tokens.to_le_bytes(), &min_out.to_le_bytes(), &[queue_remainder as u8]]),
    )
}

pub fn ix_redeem(k: &CoinKeys, user: Pubkey, tokens: u64) -> Instruction {
    ix(
        vec![
            ws(user),
            w(config_pda()),
            w(k.coin),
            w(k.mint),
            w(k.pool_sol_vault),
            w(k.pool_token_vault),
            w(ata(&user, &k.mint)),
            r(TOKEN_ID),
        ],
        data("redeem", &[&tokens.to_le_bytes()]),
    )
}

pub fn ix_process_queue(k: &CoinKeys, caller: Pubkey, epoch: u32) -> Instruction {
    ix(
        vec![
            ws(caller),
            r(config_pda()),
            w(k.coin),
            r(k.mint),
            w(k.curve_vault),
            w(k.floor_reserve),
            w(k.pool_sol_vault),
            w(k.fee_vault),
            w(k.queue_sol_vault),
            w(k.curve_token_vault),
            w(k.pool_token_vault),
            w(k.queue_escrow),
            w(epoch_record_pda(&k.coin, epoch)),
            r(TOKEN_ID),
            r(SYSTEM_ID),
        ],
        data("process_queue", &[]),
    )
}

fn settle_accounts(k: &CoinKeys, user: Pubkey, entry_epoch: u32) -> Vec<AccountMeta> {
    vec![
        ws(user),
        w(k.coin),
        r(k.mint),
        w(k.queue_sol_vault),
        w(k.queue_escrow),
        w(ata(&user, &k.mint)),
        w(queue_entry_pda(&k.coin, &user)),
        r(epoch_record_pda(&k.coin, entry_epoch)),
        r(TOKEN_ID),
    ]
}
pub fn ix_claim_queue(k: &CoinKeys, user: Pubkey, entry_epoch: u32) -> Instruction {
    ix(settle_accounts(k, user, entry_epoch), data("claim_queue", &[]))
}
pub fn ix_cancel_queue(k: &CoinKeys, user: Pubkey, entry_epoch: u32) -> Instruction {
    ix(settle_accounts(k, user, entry_epoch), data("cancel_queue", &[]))
}
pub fn ix_queue_to_redeem(k: &CoinKeys, user: Pubkey, entry_epoch: u32) -> Instruction {
    ix(
        vec![
            ws(user),
            w(config_pda()),
            w(k.coin),
            w(k.mint),
            w(k.pool_sol_vault),
            w(k.pool_token_vault),
            w(k.queue_sol_vault),
            w(k.queue_escrow),
            w(queue_entry_pda(&k.coin, &user)),
            r(epoch_record_pda(&k.coin, entry_epoch)),
            r(TOKEN_ID),
        ],
        data("queue_to_redeem", &[]),
    )
}
pub fn ix_claim_creator_fees(k: &CoinKeys, creator: Pubkey) -> Instruction {
    ix(vec![ws(creator), w(k.coin), w(k.fee_vault)], data("claim_creator_fees", &[]))
}
pub fn ix_claim_protocol_fees(k: &CoinKeys, caller: Pubkey, recipient: Pubkey) -> Instruction {
    ix(vec![rs(caller), r(config_pda()), w(k.coin), w(k.fee_vault), w(recipient)], data("claim_protocol_fees", &[]))
}

// ───────────────────────────── shadow model ─────────────────────────────

/// Pure replay of the program's accounting on `floored_core`.
#[derive(Clone, Debug)]
pub struct Model {
    pub phase: u8,
    pub curve: core::CurveState,
    pub floor_reserve: u64,
    pub pool: core::PoolState,
    pub creator_fees_owed: u64,
    pub protocol_fees_owed: u64,
    pub creator_fees_claimed: u64,
    pub protocol_fees_claimed: u64,
    pub total_redeemed_sol: u64,
    pub redeem_count: u64,
    pub supply: u64,
    pub acc: core::QueueAcc,
    pub ref_sol: u64,
    pub ref_tok: u64,
    pub window_start: u64,
    /// SOL owed to queued sellers, held in queue_sol_vault.
    pub queue_sol: u64,
    pub closed_epochs: Vec<(u32, u128)>,
}

impl Model {
    pub fn new(slot: u64) -> Model {
        Model {
            phase: 0,
            curve: core::CurveState::default(),
            floor_reserve: 0,
            pool: core::PoolState::default(),
            creator_fees_owed: 0,
            protocol_fees_owed: 0,
            creator_fees_claimed: 0,
            protocol_fees_claimed: 0,
            total_redeemed_sol: 0,
            redeem_count: 0,
            supply: core::TOTAL_SUPPLY,
            acc: core::QueueAcc::default(),
            ref_sol: P.virtual_sol,
            ref_tok: P.virtual_tok,
            window_start: slot,
            queue_sol: 0,
            closed_epochs: Vec::new(),
        }
    }
    pub fn reserves(&self) -> (u64, u64) {
        if self.phase == 0 {
            self.curve.reserves(&P).unwrap()
        } else {
            (self.pool.sol, self.pool.tok)
        }
    }
    pub fn circulating(&self) -> u64 {
        core::circulating(self.supply, self.pool.tok, self.acc.queued_total).unwrap()
    }
    pub fn fees(&mut self, f: &core::FeeSplit) {
        self.creator_fees_owed += f.creator;
        self.protocol_fees_owed += f.protocol;
    }
    pub fn buy(&mut self, sol_max: u64) -> core::CurveBuy {
        let q = core::curve_buy(&P, &self.curve, sol_max).unwrap();
        self.curve.real_sol += q.sol_net;
        self.curve.tokens_sold += q.tokens_out;
        self.floor_reserve += q.fee.pool;
        self.fees(&q.fee);
        self.lift_reference();
        q
    }
    /// Buys lift the brake reference to the window high.
    pub fn lift_reference(&mut self) {
        let (s, t) = self.reserves();
        if (s as u128) * (self.ref_tok as u128) > (self.ref_sol as u128) * (t as u128) {
            self.ref_sol = s;
            self.ref_tok = t;
        }
    }
    /// Execute a sale against the active venue; returns (sol_net, fee).
    pub fn execute_sell(&mut self, tokens: u64) -> (u64, core::FeeSplit) {
        if self.phase == 0 {
            let q = core::curve_sell(&P, &self.curve, tokens).unwrap();
            self.curve.real_sol -= q.sol_gross;
            self.curve.tokens_sold -= tokens;
            self.floor_reserve += q.fee.pool;
            self.fees(&q.fee);
            (q.sol_net, q.fee)
        } else {
            let q = core::pool_sell(&P, &self.pool, tokens).unwrap();
            self.pool = q.after;
            self.fees(&q.fee);
            (q.sol_net, q.fee)
        }
    }
    /// Window roll + queue fill. Returns Some((sold, sol_out, reward)) when a fill happened.
    pub fn settle(&mut self, slot: u64) -> Option<(u64, u64, u64)> {
        let ws = core::window_start(self.window_start, P.brake_window_slots, slot);
        if ws == self.window_start {
            return None;
        }
        self.window_start = ws;
        let (s, t) = self.reserves();
        self.ref_sol = s;
        self.ref_tok = t;
        if self.acc.queued_total == 0 {
            return None;
        }
        let budget = core::brake_allowed(P.brake_drop_bps, s, t, s, t).unwrap();
        let sold = budget.min(self.acc.queued_total);
        if sold == 0 {
            return None;
        }
        let dust = if self.phase == 0 { core::curve_sell(&P, &self.curve, sold).is_err() } else { core::pool_sell(&P, &self.pool, sold).is_err() };
        let (sol_net, fee) = if dust {
            // dust sweep: tokens go back to the venue for 0 SOL, no fee
            if self.phase == 0 {
                self.curve.tokens_sold -= sold;
            } else {
                self.pool.tok += sold;
            }
            (0, core::FeeSplit::default())
        } else {
            self.execute_sell(sold)
        };
        self.queue_sol += sol_net;
        let fill = self.acc.fill(sold, sol_net).unwrap();
        let reward = CRANK_REWARD.min(fee.protocol);
        self.protocol_fees_owed -= reward;
        if fill.closed_epoch {
            self.closed_epochs.push((fill.epoch, fill.final_sol_index));
        }
        Some((sold, sol_net, reward))
    }
    /// Direct sell under the brake: returns (executed, sol_net, queued).
    pub fn sell(&mut self, slot: u64, tokens: u64, queue_remainder: bool, existing: Option<core::QueuePosition>) -> (u64, u64, u64, Option<core::QueuePosition>, u64) {
        self.settle(slot);
        let (s, t) = self.reserves();
        let allowed = core::brake_allowed(P.brake_drop_bps, self.ref_sol, self.ref_tok, s, t).unwrap();
        let mut exec = tokens.min(allowed);
        if exec > 0 {
            let dust = if self.phase == 0 { core::curve_sell(&P, &self.curve, exec).is_err() } else { core::pool_sell(&P, &self.pool, exec).is_err() };
            if dust {
                exec = 0;
            }
        }
        let rest = tokens - exec;
        let mut sol_net = 0;
        if exec > 0 {
            sol_net = self.execute_sell(exec).0;
        }
        let mut pos = existing;
        let mut owed_paid = 0;
        if rest > 0 && queue_remainder {
            let mut carried = 0;
            if let Some(p) = existing {
                if p.epoch == self.acc.epoch {
                    let (r, o) = self.acc.leave(&p).unwrap();
                    carried = r;
                    owed_paid = o;
                } else {
                    let fin = self.closed_epochs.iter().find(|(e, _)| *e == p.epoch).unwrap().1;
                    owed_paid = core::entry_owed(&p, fin).unwrap();
                }
            }
            pos = Some(self.acc.join(carried + rest).unwrap());
            self.queue_sol -= owed_paid;
        }
        (exec, sol_net, if queue_remainder { rest } else { 0 }, pos, owed_paid)
    }
    pub fn graduate(&mut self, slot: u64) -> u64 {
        let pool = core::graduation_pool(&P, &self.curve, self.floor_reserve).unwrap();
        self.pool = pool;
        self.curve.real_sol = 0;
        self.floor_reserve = 0;
        self.phase = 1;
        self.ref_sol = pool.sol;
        self.ref_tok = pool.tok;
        self.window_start = slot;
        let reward = CRANK_REWARD.min(self.protocol_fees_owed);
        self.protocol_fees_owed -= reward;
        reward
    }
    pub fn swap_buy(&mut self, sol_in: u64) -> core::PoolBuy {
        let q = core::pool_buy(&P, &self.pool, sol_in).unwrap();
        self.pool = q.after;
        self.fees(&q.fee);
        self.lift_reference();
        q
    }
    pub fn redeem(&mut self, x: u64) -> core::Redeem {
        let q = core::redeem(&P, &self.pool, self.acc.queued_total, self.supply, x).unwrap();
        self.pool = q.after;
        self.supply = q.supply_after;
        self.total_redeemed_sol += q.sol_out;
        self.redeem_count += 1;
        q
    }
    /// (remaining, owed) of a position, removing it from the accumulator when live.
    pub fn leave(&mut self, p: &core::QueuePosition) -> (u64, u64) {
        if p.epoch == self.acc.epoch {
            self.acc.leave(p).unwrap()
        } else {
            let fin = self.closed_epochs.iter().find(|(e, _)| *e == p.epoch).unwrap().1;
            (0, core::entry_owed(p, fin).unwrap())
        }
    }
    pub fn owed(&self, p: &core::QueuePosition) -> u64 {
        if p.epoch == self.acc.epoch {
            core::entry_owed(p, self.acc.sol_index).unwrap()
        } else {
            let fin = self.closed_epochs.iter().find(|(e, _)| *e == p.epoch).unwrap().1;
            core::entry_owed(p, fin).unwrap()
        }
    }
    pub fn remaining(&self, p: &core::QueuePosition) -> u64 {
        if p.epoch == self.acc.epoch {
            core::entry_remaining(p, self.acc.scale).unwrap()
        } else {
            0
        }
    }
}

// ───────────────────────────── the chain ─────────────────────────────

pub struct Chain {
    pub svm: LiteSVM,
    pub authority: Keypair,
    pub recipient: Keypair,
    pub creator: Keypair,
    pub keys: CoinKeys,
    pub model: Model,
    pub vault_rent: u64,
}

fn so_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("programs").join("floored").join("target").join("deploy").join("floored.so")
}
fn fixture(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("fixtures").join(name)
}

pub fn assert_err<T: std::fmt::Debug>(res: Result<T, FailedTransactionMetadata>, name: &str) {
    match res {
        Ok(_) => panic!("expected error {name}, transaction succeeded"),
        Err(e) => {
            let logs = e.meta.logs.join("\n");
            assert!(logs.contains(name), "expected error {name}, got:\n{logs}\n{:?}", e.err);
        }
    }
}

impl Chain {
    /// Fresh SVM: program + metadata program loaded, config initialised, one coin created.
    pub fn new() -> Chain {
        let mut svm = LiteSVM::new();
        let so = so_path();
        svm.add_program_from_file(PROGRAM_ID, &so)
            .unwrap_or_else(|e| panic!("cannot load {} (run `cargo-build-sbf` in programs/floored first): {e:?}", so.display()));
        svm.add_program_from_file(METADATA_ID, fixture("mpl_token_metadata.so")).expect("metadata fixture");
        let authority = Keypair::new();
        let recipient = Keypair::new();
        let creator = Keypair::new();
        svm.airdrop(&authority.pubkey(), 10 * SOL).unwrap();
        svm.airdrop(&creator.pubkey(), 100 * SOL).unwrap();
        svm.airdrop(&recipient.pubkey(), SOL).unwrap();
        let mint = Keypair::new();
        let keys = CoinKeys::new(mint.pubkey());
        let mut c = Chain { svm, authority, recipient, creator, keys, model: Model::new(0), vault_rent: 0 };
        c.vault_rent = c.rent(0);
        let a = c.authority.insecure_clone();
        c.send(&[ix_initialize(a.pubkey(), &P, CRANK_REWARD, CREATE_FEE, c.recipient.pubkey())], &[&a]).expect("initialize");
        let cr = c.creator.insecure_clone();
        let k = c.keys;
        c.send_big(&[ix_create_coin(cr.pubkey(), c.recipient.pubkey(), &k, "Floored Test", "FLRT", "https://floored.fun/meta/test.json")], &[&cr, &mint])
            .expect("create_coin");
        c.model = Model::new(c.slot());
        c
    }

    pub fn send(&mut self, ixs: &[Instruction], signers: &[&Keypair]) -> TxResult {
        let tx = Transaction::new_signed_with_payer(ixs, Some(&signers[0].pubkey()), signers, self.svm.latest_blockhash());
        let res = self.svm.send_transaction(tx);
        self.svm.expire_blockhash();
        res
    }
    pub fn send_big(&mut self, ixs: &[Instruction], signers: &[&Keypair]) -> TxResult {
        let mut all = vec![ComputeBudgetInstruction::set_compute_unit_limit(1_400_000)];
        all.extend_from_slice(ixs);
        self.send(&all, signers)
    }
    pub fn slot(&self) -> u64 {
        self.svm.get_sysvar::<Clock>().slot
    }
    pub fn warp(&mut self, slots: u64) {
        let mut clock = self.svm.get_sysvar::<Clock>();
        clock.slot += slots;
        clock.unix_timestamp += (slots as i64) * 2 / 5;
        self.svm.set_sysvar(&clock);
    }
    pub fn next_window(&mut self) {
        self.warp(WINDOW);
    }
    pub fn wallet(&mut self, sol: u64) -> Keypair {
        let k = Keypair::new();
        self.svm.airdrop(&k.pubkey(), sol * SOL).unwrap();
        k
    }
    pub fn account(&self, k: &Pubkey) -> Option<Account> {
        self.svm.get_account(k)
    }
    pub fn lamports(&self, k: &Pubkey) -> u64 {
        self.svm.get_account(k).map(|a| a.lamports).unwrap_or(0)
    }
    pub fn rent(&self, len: usize) -> u64 {
        self.svm.minimum_balance_for_rent_exemption(len)
    }
    pub fn token_balance(&self, k: &Pubkey) -> u64 {
        self.svm.get_account(k).map(|a| spl_token_interface::state::Account::unpack(&a.data).unwrap().amount).unwrap_or(0)
    }
    pub fn bag(&self, owner: &Pubkey) -> u64 {
        self.token_balance(&ata(owner, &self.keys.mint))
    }
    pub fn mint_state(&self) -> spl_token_interface::state::Mint {
        spl_token_interface::state::Mint::unpack(&self.svm.get_account(&self.keys.mint).unwrap().data).unwrap()
    }
    pub fn coin(&self) -> CoinState {
        let a = self.svm.get_account(&self.keys.coin).unwrap();
        CoinState::try_deserialize(&mut &a.data[..]).unwrap()
    }
    pub fn config(&self) -> GlobalConfig {
        let a = self.svm.get_account(&config_pda()).unwrap();
        GlobalConfig::try_deserialize(&mut &a.data[..]).unwrap()
    }
    pub fn entry(&self, owner: &Pubkey) -> Option<QueueEntry> {
        let a = self.svm.get_account(&queue_entry_pda(&self.keys.coin, owner))?;
        if a.data.is_empty() {
            return None;
        }
        Some(QueueEntry::try_deserialize(&mut &a.data[..]).unwrap())
    }
    pub fn epoch_record(&self, epoch: u32) -> Option<EpochRecord> {
        let a = self.svm.get_account(&epoch_record_pda(&self.keys.coin, epoch))?;
        if a.data.is_empty() {
            return None;
        }
        Some(EpochRecord::try_deserialize(&mut &a.data[..]).unwrap())
    }
    pub fn entry_pos(&self, owner: &Pubkey) -> Option<core::QueuePosition> {
        self.entry(owner).map(|e| e.position())
    }
    pub fn epoch(&self) -> u32 {
        self.coin().brake.epoch
    }

    /// On-chain floor per token (Q64) and pool price (Q64).
    pub fn floor_q64(&self) -> u128 {
        let c = self.coin();
        let circ = core::circulating(self.mint_state().supply, c.pool_tok, c.brake.queued_total).unwrap();
        core::floor_q64(c.pool_sol, circ).unwrap()
    }
    pub fn price_q64(&self) -> u128 {
        let (s, t) = self.coin().reserves().unwrap();
        core::price_q64(s, t).unwrap()
    }
    /// What a holder of `x` tokens would receive right now by redeeming.
    pub fn redeem_quote(&self, x: u64) -> core::CoreResult<core::Redeem> {
        let c = self.coin();
        core::redeem(&P, &c.pool(), c.brake.queued_total, self.mint_state().supply, x)
    }

    // ── mirror ──

    /// Every field of CoinState and every vault balance equals the model.
    pub fn assert_mirror(&self) {
        let c = self.coin();
        let m = &self.model;
        assert_eq!(c.phase, m.phase, "phase");
        assert_eq!(c.real_sol, m.curve.real_sol, "real_sol");
        assert_eq!(c.tokens_sold, m.curve.tokens_sold, "tokens_sold");
        assert_eq!(c.floor_reserve, m.floor_reserve, "floor_reserve");
        assert_eq!(c.pool_sol, m.pool.sol, "pool_sol");
        assert_eq!(c.pool_tok, m.pool.tok, "pool_tok");
        assert_eq!(c.creator_fees_owed, m.creator_fees_owed, "creator_fees_owed");
        assert_eq!(c.protocol_fees_owed, m.protocol_fees_owed, "protocol_fees_owed");
        assert_eq!(c.total_redeemed_sol, m.total_redeemed_sol, "total_redeemed_sol");
        assert_eq!(c.brake.epoch, m.acc.epoch, "epoch");
        assert_eq!(c.brake.scale, m.acc.scale, "scale");
        assert_eq!(c.brake.sol_index, m.acc.sol_index, "sol_index");
        assert_eq!(c.brake.queued_total, m.acc.queued_total, "queued_total");
        assert_eq!(c.brake.ref_sol, m.ref_sol, "ref_sol");
        assert_eq!(c.brake.ref_tok, m.ref_tok, "ref_tok");
        assert_eq!(c.brake.window_start, m.window_start, "window_start");
        assert_eq!(self.mint_state().supply, m.supply, "supply");
        // vault balances: exactly rent + tracked (lamport vaults receive nothing else)
        let k = &self.keys;
        assert_eq!(self.lamports(&k.curve_vault), self.vault_rent + c.real_sol, "curve_vault");
        assert_eq!(self.lamports(&k.floor_reserve), self.vault_rent + c.floor_reserve, "floor_reserve vault");
        assert_eq!(self.lamports(&k.pool_sol_vault), self.vault_rent + c.pool_sol, "pool_sol_vault");
        assert_eq!(self.lamports(&k.fee_vault), self.vault_rent + c.creator_fees_owed + c.protocol_fees_owed, "fee_vault");
        assert_eq!(self.lamports(&k.queue_sol_vault), self.vault_rent + m.queue_sol, "queue_sol_vault");
        assert_eq!(self.token_balance(&k.pool_token_vault), c.pool_tok, "pool_token_vault");
        if c.phase == 0 {
            assert_eq!(self.token_balance(&k.curve_token_vault), core::TOTAL_SUPPLY - c.tokens_sold, "curve_token_vault");
        } else {
            assert_eq!(self.token_balance(&k.curve_token_vault), 0, "curve_token_vault after graduation");
        }
        // the escrow never holds less than the queue (dust from flooring may remain)
        assert!(self.token_balance(&k.queue_escrow) >= c.brake.queued_total, "queue_escrow");
        for (e, fin) in &m.closed_epochs {
            let rec = self.epoch_record(*e).unwrap_or_else(|| panic!("epoch record {e} missing"));
            assert!(rec.closed);
            assert_eq!(rec.final_sol_index, *fin, "final sol index of epoch {e}");
        }
    }

    // ── operations (on-chain + model) ──

    pub fn buy(&mut self, user: &Keypair, sol_max: u64) -> core::CurveBuy {
        let k = self.keys;
        let before = self.lamports(&user.pubkey());
        let had_ata = self.account(&ata(&user.pubkey(), &k.mint)).is_some();
        self.send(&[ix_buy(&k, user.pubkey(), sol_max, 0)], &[user]).unwrap_or_else(|e| panic!("buy: {:#?}", e.meta.logs));
        let q = self.model.buy(sol_max);
        let ata_rent = if had_ata { 0 } else { self.rent(165) };
        assert_eq!(before - self.lamports(&user.pubkey()), q.sol_charged + SIG_FEE + ata_rent, "buyer charged exactly net + fee");
        self.assert_mirror();
        q
    }
    pub fn try_buy(&mut self, user: &Keypair, sol_max: u64) -> TxResult {
        let k = self.keys;
        self.send(&[ix_buy(&k, user.pubkey(), sol_max, 0)], &[user])
    }
    pub fn fill_curve(&mut self, buyer: &Keypair) {
        while !self.model.curve.is_complete(&P) {
            self.buy(buyer, 10 * SOL);
        }
    }
    /// Sell (curve or pool, by phase). Returns (executed, sol_net, queued).
    pub fn sell(&mut self, user: &Keypair, tokens: u64, queue_remainder: bool) -> (u64, u64, u64) {
        let k = self.keys;
        let epoch = self.epoch();
        let slot = self.slot();
        let before = self.lamports(&user.pubkey());
        let existing = self.entry_pos(&user.pubkey());
        let had_entry = existing.is_some();
        let ixb = if self.model.phase == 0 { ix_sell(&k, user.pubkey(), epoch, tokens, 0, queue_remainder) } else { ix_swap_sell(&k, user.pubkey(), epoch, tokens, 0, queue_remainder) };
        self.send_big(&[ixb], &[user]).unwrap_or_else(|e| panic!("sell: {:#?}", e.meta.logs));
        let (exec, sol_net, queued, pos, owed_paid) = self.model.sell(slot, tokens, queue_remainder, existing);
        // the seller may have paid an epoch record (closing fill) and/or a queue entry rent
        let mut expected = before as i128 + sol_net as i128 + owed_paid as i128 - SIG_FEE as i128;
        if queued > 0 && !had_entry {
            expected -= self.rent(8 + QueueEntry::INIT_SPACE) as i128;
        }
        let actual = self.lamports(&user.pubkey()) as i128;
        let diff = expected - actual;
        let rec_rent = self.rent(8 + EpochRecord::INIT_SPACE) as i128;
        let reward = self.model.closed_epochs.len(); // only used to allow the record rent below
        let _ = reward;
        assert!(diff == 0 || diff == rec_rent || diff == rec_rent - CRANK_REWARD as i128 || diff == -(CRANK_REWARD as i128), "seller balance off by {diff} (exec {exec}, queued {queued})");
        if let Some(p) = pos {
            let e = self.entry(&user.pubkey()).expect("entry");
            assert_eq!(e.position(), p, "queue position");
        }
        self.assert_mirror();
        (exec, sol_net, queued)
    }
    pub fn try_sell(&mut self, user: &Keypair, tokens: u64, min_out: u64, queue_remainder: bool) -> TxResult {
        let k = self.keys;
        let epoch = self.epoch();
        let ixb = if self.coin().phase == 0 { ix_sell(&k, user.pubkey(), epoch, tokens, min_out, queue_remainder) } else { ix_swap_sell(&k, user.pubkey(), epoch, tokens, min_out, queue_remainder) };
        self.send_big(&[ixb], &[user])
    }
    pub fn graduate(&mut self, caller: &Keypair) {
        let k = self.keys;
        let before = self.lamports(&caller.pubkey());
        self.send(&[ix_graduate(&k, caller.pubkey())], &[caller]).unwrap_or_else(|e| panic!("graduate: {:#?}", e.meta.logs));
        let slot = self.slot();
        let reward = self.model.graduate(slot);
        assert_eq!(self.lamports(&caller.pubkey()), before + reward - SIG_FEE, "crank reward");
        self.assert_mirror();
    }
    pub fn try_graduate(&mut self, caller: &Keypair) -> TxResult {
        let k = self.keys;
        self.send(&[ix_graduate(&k, caller.pubkey())], &[caller])
    }
    pub fn swap_buy(&mut self, user: &Keypair, sol_in: u64) -> core::PoolBuy {
        let k = self.keys;
        let before = self.lamports(&user.pubkey());
        let had_ata = self.account(&ata(&user.pubkey(), &k.mint)).is_some();
        self.send(&[ix_swap_buy(&k, user.pubkey(), sol_in, 0)], &[user]).unwrap_or_else(|e| panic!("swap_buy: {:#?}", e.meta.logs));
        let q = self.model.swap_buy(sol_in);
        let ata_rent = if had_ata { 0 } else { self.rent(165) };
        assert_eq!(before - self.lamports(&user.pubkey()), sol_in + SIG_FEE + ata_rent);
        self.assert_mirror();
        q
    }
    pub fn redeem(&mut self, user: &Keypair, x: u64) -> core::Redeem {
        let k = self.keys;
        let before = self.lamports(&user.pubkey());
        let bag = self.bag(&user.pubkey());
        self.send(&[ix_redeem(&k, user.pubkey(), x)], &[user]).unwrap_or_else(|e| panic!("redeem: {:#?}", e.meta.logs));
        let q = self.model.redeem(x);
        assert_eq!(self.lamports(&user.pubkey()), before + q.sol_out - SIG_FEE, "redeem payout");
        assert_eq!(self.bag(&user.pubkey()), bag - x);
        self.assert_mirror();
        q
    }
    pub fn try_redeem(&mut self, user: &Keypair, x: u64) -> TxResult {
        let k = self.keys;
        self.send(&[ix_redeem(&k, user.pubkey(), x)], &[user])
    }
    pub fn process_queue(&mut self, caller: &Keypair) -> (u64, u64) {
        let k = self.keys;
        let epoch = self.epoch();
        let before = self.lamports(&caller.pubkey());
        let slot = self.slot();
        self.send_big(&[ix_process_queue(&k, caller.pubkey(), epoch)], &[caller]).unwrap_or_else(|e| panic!("process_queue: {:#?}", e.meta.logs));
        let (sold, sol_out, reward) = self.model.settle(slot).expect("model: nothing to fill");
        let after = self.lamports(&caller.pubkey());
        let rec_rent = self.rent(8 + EpochRecord::INIT_SPACE);
        let paid_record = before as i128 + reward as i128 - SIG_FEE as i128 - after as i128;
        assert!(paid_record == 0 || paid_record == rec_rent as i128, "cranker balance off by {paid_record}");
        self.assert_mirror();
        (sold, sol_out)
    }
    pub fn try_process_queue(&mut self, caller: &Keypair) -> TxResult {
        let k = self.keys;
        let epoch = self.epoch();
        self.send_big(&[ix_process_queue(&k, caller.pubkey(), epoch)], &[caller])
    }
    pub fn cancel_queue(&mut self, user: &Keypair) -> (u64, u64) {
        let k = self.keys;
        let pos = self.entry_pos(&user.pubkey()).expect("queued");
        let before = self.lamports(&user.pubkey());
        let bag = self.bag(&user.pubkey());
        self.send(&[ix_cancel_queue(&k, user.pubkey(), pos.epoch)], &[user]).unwrap_or_else(|e| panic!("cancel_queue: {:#?}", e.meta.logs));
        let (remaining, owed) = self.model.leave(&pos);
        self.model.queue_sol -= owed;
        let entry_rent = self.rent(8 + QueueEntry::INIT_SPACE);
        assert_eq!(self.lamports(&user.pubkey()), before + owed + entry_rent - SIG_FEE, "cancel payout");
        assert_eq!(self.bag(&user.pubkey()), bag + remaining, "tokens returned");
        assert!(self.entry(&user.pubkey()).is_none(), "entry closed");
        self.assert_mirror();
        (remaining, owed)
    }
    pub fn claim_queue(&mut self, user: &Keypair) -> u64 {
        let k = self.keys;
        let pos = self.entry_pos(&user.pubkey()).expect("queued");
        let before = self.lamports(&user.pubkey());
        self.send(&[ix_claim_queue(&k, user.pubkey(), pos.epoch)], &[user]).unwrap_or_else(|e| panic!("claim_queue: {:#?}", e.meta.logs));
        let owed = self.model.owed(&pos);
        self.model.queue_sol -= owed;
        let live = pos.epoch == self.model.acc.epoch;
        let entry_rent = if live { 0 } else { self.rent(8 + QueueEntry::INIT_SPACE) };
        assert_eq!(self.lamports(&user.pubkey()), before + owed + entry_rent - SIG_FEE, "claim payout");
        if live {
            let e = self.entry(&user.pubkey()).unwrap();
            assert_eq!(e.sol_index_at_join, self.model.acc.sol_index);
            assert_eq!(e.shares, pos.shares);
        } else {
            assert!(self.entry(&user.pubkey()).is_none());
        }
        self.assert_mirror();
        owed
    }
    pub fn queue_to_redeem(&mut self, user: &Keypair) -> (u64, u64) {
        let k = self.keys;
        let pos = self.entry_pos(&user.pubkey()).expect("queued");
        let before = self.lamports(&user.pubkey());
        self.send(&[ix_queue_to_redeem(&k, user.pubkey(), pos.epoch)], &[user]).unwrap_or_else(|e| panic!("queue_to_redeem: {:#?}", e.meta.logs));
        let (remaining, owed) = self.model.leave(&pos);
        self.model.queue_sol -= owed;
        let mut paid = owed;
        if remaining > 0 {
            let q = self.model.redeem(remaining);
            paid += q.sol_out;
        }
        let entry_rent = self.rent(8 + QueueEntry::INIT_SPACE);
        assert_eq!(self.lamports(&user.pubkey()), before + paid + entry_rent - SIG_FEE, "queue_to_redeem payout");
        assert!(self.entry(&user.pubkey()).is_none());
        self.assert_mirror();
        (remaining, paid)
    }
    pub fn claim_creator_fees(&mut self) -> u64 {
        let k = self.keys;
        let cr = self.creator.insecure_clone();
        let before = self.lamports(&cr.pubkey());
        self.send(&[ix_claim_creator_fees(&k, cr.pubkey())], &[&cr]).unwrap_or_else(|e| panic!("claim_creator_fees: {:#?}", e.meta.logs));
        let amt = self.model.creator_fees_owed;
        self.model.creator_fees_owed = 0;
        self.model.creator_fees_claimed += amt;
        assert_eq!(self.lamports(&cr.pubkey()), before + amt - SIG_FEE);
        self.assert_mirror();
        amt
    }
    pub fn claim_protocol_fees(&mut self, caller: &Keypair) -> u64 {
        let k = self.keys;
        let rec = self.recipient.pubkey();
        let before = self.lamports(&rec);
        self.send(&[ix_claim_protocol_fees(&k, caller.pubkey(), rec)], &[caller]).unwrap_or_else(|e| panic!("claim_protocol_fees: {:#?}", e.meta.logs));
        let amt = self.model.protocol_fees_owed;
        self.model.protocol_fees_owed = 0;
        self.model.protocol_fees_claimed += amt;
        assert_eq!(self.lamports(&rec), before + amt);
        self.assert_mirror();
        amt
    }

    /// A graduated coin with `buyer` holding most of the curve supply.
    pub fn graduated(buyer: &Keypair) -> Chain {
        let mut c = Chain::new();
        c.svm.airdrop(&buyer.pubkey(), 200 * SOL).unwrap();
        c.fill_curve(buyer);
        let cr = c.creator.insecure_clone();
        c.graduate(&cr);
        c
    }
}

impl Default for Chain {
    fn default() -> Self {
        Chain::new()
    }
}

pub fn idl() -> serde_json::Value {
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("programs").join("floored").join("idl").join("floored.json");
    serde_json::from_str(&std::fs::read_to_string(p).expect("idl (run `pnpm idl`)")).unwrap()
}
