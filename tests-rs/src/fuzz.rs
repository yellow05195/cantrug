//! Randomized driver for the built program.
//!
//! Every step picks an instruction and random arguments, asks the shadow model
//! whether the program must accept or refuse it (and with which error), sends
//! the real transaction to LiteSVM, and then checks:
//!
//!   * the outcome is the predicted one (success, or the predicted error name);
//!   * on success, the model replay matches `CoinState` and every vault to the
//!     lamport (`assert_mirror`), the escrow covers the queue, and a redeem
//!     never lowered the floor nor the pool price;
//!   * on failure, the chain did not change at all;
//!   * no lamport was created or destroyed: the sum of every account the fuzz
//!     knows about moves by exactly the transaction fee, success or not;
//!   * the program never fails with an arithmetic / accounting error
//!     (`Overflow`, `VaultAccounting`) or a non-predicted error.
//!
//! Deterministic: `Fuzz::new(seed)`; the seed and step are printed on failure.

use crate::*;
use floored_core as fc;

/// SplitMix64: tiny, deterministic, good enough to pick arguments.
#[derive(Clone)]
pub struct Rng(u64);

impl Rng {
    pub fn new(seed: u64) -> Rng {
        Rng(seed ^ 0x9E37_79B9_7F4A_7C15)
    }
    pub fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    pub fn below(&mut self, n: u64) -> u64 {
        if n == 0 {
            0
        } else {
            self.next() % n
        }
    }
    pub fn range(&mut self, lo: u64, hi: u64) -> u64 {
        lo + self.below(hi.saturating_sub(lo).saturating_add(1))
    }
    pub fn chance(&mut self, pct: u64) -> bool {
        self.below(100) < pct
    }
    /// A fraction in [1, 1_000_000] of something, biased towards small and total.
    pub fn fraction_ppm(&mut self) -> u64 {
        match self.below(10) {
            0 => 1_000_000,
            1 => self.range(900_000, 1_000_000),
            2 | 3 => self.range(1, 1_000),
            _ => self.range(1, 1_000_000),
        }
    }
}

#[derive(Clone, Debug)]
pub enum Op {
    Warp(u64),
    Buy { who: usize, sol: u64 },
    Sell { who: usize, ppm: u64, queue: bool, min_out: u64 },
    Graduate { who: usize },
    SwapBuy { who: usize, sol: u64 },
    SwapSell { who: usize, ppm: u64, queue: bool, min_out: u64 },
    Redeem { who: usize, ppm: u64 },
    ProcessQueue { who: usize },
    ClaimQueue { who: usize },
    CancelQueue { who: usize },
    QueueToRedeem { who: usize },
    ClaimCreatorFees,
    ClaimProtocolFees { who: usize },
    UpdateConfig,
}

/// What the model says the program must do with an op.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Expect {
    Ok,
    Err(&'static str),
    /// Structurally impossible op (no bag, no entry): skipped, not sent.
    Skip,
}

fn core_err_name(e: fc::CoreError) -> &'static str {
    use fc::CoreError::*;
    match e {
        Overflow | DivisionByZero => "Overflow",
        ZeroAmount => "ZeroAmount",
        DustOutput => "DustOutput",
        CurveComplete => "CurveComplete",
        CurveNotComplete => "CurveNotComplete",
        ExceedsAvailable => "ExceedsAvailable",
        NothingInCirculation => "NothingInCirculation",
        InvalidParams => "InvalidParams",
        ExceedsQueue => "ExceedsQueue",
    }
}

pub struct Stats {
    pub steps: u64,
    pub sent: u64,
    pub ok: u64,
    pub refused: u64,
    pub skipped: u64,
    pub max_cu: u64,
    pub max_cu_op: String,
    pub by_kind: std::collections::BTreeMap<&'static str, (u64, u64)>,
}

pub struct Fuzz {
    pub seed: u64,
    pub rng: Rng,
    pub chain: Chain,
    pub wallets: Vec<Keypair>,
    pub stats: Stats,
    pub step_no: u64,
    pub log: Vec<String>,
}

const WALLETS: usize = 6;
const WALLET_SOL: u64 = 400;

impl Fuzz {
    pub fn new(seed: u64) -> Fuzz {
        let mut chain = Chain::new();
        let wallets: Vec<Keypair> = (0..WALLETS).map(|_| chain.wallet(WALLET_SOL)).collect();
        Fuzz {
            seed,
            rng: Rng::new(seed),
            chain,
            wallets,
            stats: Stats { steps: 0, sent: 0, ok: 0, refused: 0, skipped: 0, max_cu: 0, max_cu_op: String::new(), by_kind: Default::default() },
            step_no: 0,
            log: Vec::new(),
        }
    }

    fn ctx(&self) -> String {
        format!("seed {} step {}", self.seed, self.step_no)
    }

    // ───────────────────────── op generation ─────────────────────────

    pub fn pick(&mut self) -> Op {
        let who = self.rng.below(WALLETS as u64) as usize;
        let graduated = self.chain.model.phase == 1;
        let r = self.rng.below(100);
        match r {
            0..=11 => Op::Warp(match self.rng.below(8) {
                0 => 0,
                1 | 2 => self.rng.range(1, 149),
                3 => 150,
                4 => self.rng.range(150, 1_000),
                5 => self.rng.range(1_000, 10_000),
                6 => 216_000,
                _ => self.rng.range(1, 10),
            }),
            12..=29 => {
                let sol = match self.rng.below(6) {
                    0 => self.rng.range(1, 10_000),
                    1 => self.rng.range(10_000, SOL / 100),
                    _ => self.rng.range(SOL / 100, 25 * SOL),
                };
                if graduated { Op::SwapBuy { who, sol } } else { Op::Buy { who, sol } }
            }
            30..=49 => {
                let ppm = self.rng.fraction_ppm();
                let queue = self.rng.chance(70);
                let min_out = if self.rng.chance(8) { u64::MAX / 8 } else { 0 };
                if graduated { Op::SwapSell { who, ppm, queue, min_out } } else { Op::Sell { who, ppm, queue, min_out } }
            }
            50..=56 => Op::Graduate { who },
            57..=69 => Op::Redeem { who, ppm: self.rng.fraction_ppm() },
            70..=78 => Op::ProcessQueue { who },
            79..=83 => Op::ClaimQueue { who },
            84..=88 => Op::CancelQueue { who },
            89..=93 => Op::QueueToRedeem { who },
            94..=95 => Op::ClaimCreatorFees,
            96..=97 => Op::ClaimProtocolFees { who },
            _ => Op::UpdateConfig,
        }
    }

    // ───────────────────────── helpers ─────────────────────────

    fn kind(op: &Op) -> &'static str {
        match op {
            Op::Warp(_) => "warp",
            Op::Buy { .. } => "buy",
            Op::Sell { .. } => "sell",
            Op::Graduate { .. } => "graduate",
            Op::SwapBuy { .. } => "swap_buy",
            Op::SwapSell { .. } => "swap_sell",
            Op::Redeem { .. } => "redeem",
            Op::ProcessQueue { .. } => "process_queue",
            Op::ClaimQueue { .. } => "claim_queue",
            Op::CancelQueue { .. } => "cancel_queue",
            Op::QueueToRedeem { .. } => "queue_to_redeem",
            Op::ClaimCreatorFees => "claim_creator_fees",
            Op::ClaimProtocolFees { .. } => "claim_protocol_fees",
            Op::UpdateConfig => "update_config",
        }
    }

    /// Every account whose lamports the program or the fuzz can move.
    fn known_accounts(&self) -> Vec<Pubkey> {
        let c = &self.chain;
        let k = &c.keys;
        let mut v = vec![
            c.authority.pubkey(),
            c.recipient.pubkey(),
            c.creator.pubkey(),
            config_pda(),
            k.coin,
            k.mint,
            k.metadata,
            k.curve_vault,
            k.floor_reserve,
            k.pool_sol_vault,
            k.fee_vault,
            k.queue_sol_vault,
            k.curve_token_vault,
            k.pool_token_vault,
            k.queue_escrow,
            ata(&c.creator.pubkey(), &k.mint),
        ];
        for w in &self.wallets {
            v.push(w.pubkey());
            v.push(ata(&w.pubkey(), &k.mint));
            v.push(queue_entry_pda(&k.coin, &w.pubkey()));
        }
        let epoch = c.model.acc.epoch;
        for e in 0..=epoch + 1 {
            v.push(epoch_record_pda(&k.coin, e));
        }
        v
    }

    fn total_lamports(&self) -> u128 {
        self.known_accounts().iter().map(|a| self.chain.lamports(a) as u128).sum()
    }

    fn snapshot(&self) -> Vec<(Pubkey, Option<Account>)> {
        self.known_accounts().into_iter().map(|a| (a, self.chain.account(&a))).collect()
    }

    fn floor_and_price(&self) -> Option<(u128, u128)> {
        let c = self.chain.coin();
        if c.phase != 1 {
            return None;
        }
        let supply = self.chain.mint_state().supply;
        let circ = fc::circulating(supply, c.pool_tok, c.brake.queued_total).ok()?;
        if circ == 0 || c.pool_tok == 0 {
            return None;
        }
        Some((fc::floor_q64(c.pool_sol, circ).ok()?, fc::price_q64(c.pool_sol, c.pool_tok).ok()?))
    }

    /// Predict the executed / queued split of a sell on a model copy (mirrors `sell_common`).
    /// Returns Err(name) when the program must refuse.
    fn model_sell(m: &mut Model, slot: u64, tokens: u64, queue_remainder: bool, min_out: u64, existing: Option<fc::QueuePosition>) -> Result<(u64, u64, u64), &'static str> {
        if tokens == 0 {
            return Err("ZeroAmount");
        }
        let start_epoch = m.acc.epoch;
        let (_, reward) = match m.settle(slot) {
            Some((_, _, r)) => (true, r),
            None => (false, 0),
        };
        let (s, t) = m.reserves();
        let allowed = fc::brake_allowed(P.brake_drop_bps, m.ref_sol, m.ref_tok, s, t).map_err(core_err_name)?;
        let mut exec = tokens.min(allowed);
        if exec > 0 {
            let dust = if m.phase == 0 { fc::curve_sell(&P, &m.curve, exec).is_err() } else { fc::pool_sell(&P, &m.pool, exec).is_err() };
            if dust {
                exec = 0;
            }
        }
        let rest = tokens - exec;
        let queued = if queue_remainder { rest } else { 0 };
        if exec == 0 && queued == 0 {
            return Err("SlippageExceeded");
        }
        let mut sol_net = 0;
        if exec > 0 {
            let (net, _) = m.execute_sell(exec);
            sol_net = net;
            if (sol_net as u128) * (tokens as u128) < (min_out as u128) * (exec as u128) {
                return Err("SlippageExceeded");
            }
        }
        let mut owed = 0;
        if queued > 0 {
            let mut carried = 0;
            if let Some(p) = existing {
                if p.epoch == m.acc.epoch {
                    let (r, o) = m.acc.leave(&p).map_err(core_err_name)?;
                    carried = r;
                    owed = o;
                } else if p.epoch == start_epoch {
                    let fin = m.closed_epochs.iter().find(|(e, _)| *e == p.epoch).map(|x| x.1).ok_or("EpochRecordMismatch")?;
                    owed = fc::entry_owed(&p, fin).map_err(core_err_name)?;
                } else {
                    return Err("StaleQueueEntry");
                }
            }
            m.acc.join(carried + queued).map_err(core_err_name)?;
            m.queue_sol -= owed;
        }
        let _ = reward;
        Ok((exec, sol_net, queued))
    }

    // ───────────────────────── one step ─────────────────────────

    /// Run one op. Panics (with seed and step) on any violated oracle.
    pub fn step(&mut self, op: Op) {
        self.step_no += 1;
        self.stats.steps += 1;
        let kind = Self::kind(&op);
        self.stats.by_kind.entry(kind).or_insert((0, 0)).0 += 1;

        if let Op::Warp(n) = op {
            if n > 0 {
                self.chain.warp(n);
            }
            return;
        }

        let slot = self.chain.slot();
        let k = self.chain.keys;
        let epoch = self.chain.epoch();
        let before_model = self.chain.model.clone();
        let before_total = self.total_lamports();
        let before_snapshot = self.snapshot();
        let before_fp = self.floor_and_price();
        let mut local = self.chain.model.clone();
        let m = &mut local;

        // Build the instruction and the prediction together.
        let (ix, signer, expect): (Option<Instruction>, usize, Expect) = match &op {
            Op::Buy { who, sol } => {
                let w = &self.wallets[*who];
                let bal = self.chain.lamports(&w.pubkey());
                if *sol + SOL > bal {
                    (None, *who, Expect::Skip)
                } else {
                    let expect = if m.phase != 0 {
                        Expect::Err("WrongPhase")
                    } else {
                        match fc::curve_buy(&P, &m.curve, *sol) {
                            Ok(_) => {
                                m.buy(*sol);
                                Expect::Ok
                            }
                            Err(e) => Expect::Err(core_err_name(e)),
                        }
                    };
                    (Some(ix_buy(&k, w.pubkey(), *sol, 0)), *who, expect)
                }
            }
            Op::SwapBuy { who, sol } => {
                let w = &self.wallets[*who];
                let bal = self.chain.lamports(&w.pubkey());
                if *sol + SOL > bal {
                    (None, *who, Expect::Skip)
                } else {
                    let expect = if m.phase != 1 {
                        Expect::Err("WrongPhase")
                    } else {
                        match fc::pool_buy(&P, &m.pool, *sol) {
                            Ok(_) => {
                                m.swap_buy(*sol);
                                Expect::Ok
                            }
                            Err(e) => Expect::Err(core_err_name(e)),
                        }
                    };
                    (Some(ix_swap_buy(&k, w.pubkey(), *sol, 0)), *who, expect)
                }
            }
            Op::Sell { who, ppm, queue, min_out } | Op::SwapSell { who, ppm, queue, min_out } => {
                let w = &self.wallets[*who];
                let bag = self.chain.bag(&w.pubkey());
                let tokens = ((bag as u128) * (*ppm as u128) / 1_000_000) as u64;
                let is_curve_ix = matches!(op, Op::Sell { .. });
                if bag == 0 {
                    (None, *who, Expect::Skip)
                } else {
                    let existing = self.chain.entry_pos(&w.pubkey());
                    let expect = if (m.phase == 0) != is_curve_ix {
                        Expect::Err("WrongPhase")
                    } else {
                        match Self::model_sell(m, slot, tokens, *queue, *min_out, existing) {
                            Ok(_) => Expect::Ok,
                            Err(name) => Expect::Err(name),
                        }
                    };
                    let ix = if is_curve_ix { ix_sell(&k, w.pubkey(), epoch, tokens, *min_out, *queue) } else { ix_swap_sell(&k, w.pubkey(), epoch, tokens, *min_out, *queue) };
                    (Some(ix), *who, expect)
                }
            }
            Op::Graduate { who } => {
                let w = &self.wallets[*who];
                let expect = if m.phase != 0 {
                    Expect::Err("WrongPhase")
                } else if !m.curve.is_complete(&P) {
                    Expect::Err("CurveNotComplete")
                } else {
                    m.graduate(slot);
                    Expect::Ok
                };
                (Some(ix_graduate(&k, w.pubkey())), *who, expect)
            }
            Op::Redeem { who, ppm } => {
                let w = &self.wallets[*who];
                let bag = self.chain.bag(&w.pubkey());
                let x = ((bag as u128) * (*ppm as u128) / 1_000_000) as u64;
                if bag == 0 {
                    (None, *who, Expect::Skip)
                } else {
                    let expect = if m.phase != 1 {
                        Expect::Err("WrongPhase")
                    } else {
                        match fc::redeem(&P, &m.pool, m.acc.queued_total, m.supply, x) {
                            Ok(_) => {
                                m.redeem(x);
                                Expect::Ok
                            }
                            Err(e) => Expect::Err(core_err_name(e)),
                        }
                    };
                    (Some(ix_redeem(&k, w.pubkey(), x)), *who, expect)
                }
            }
            Op::ProcessQueue { who } => {
                let w = &self.wallets[*who];
                let expect = if m.acc.queued_total == 0 {
                    Expect::Err("QueueEmpty")
                } else {
                    match m.settle(slot) {
                        Some(_) => Expect::Ok,
                        None => Expect::Err("WindowNotElapsed"),
                    }
                };
                (Some(ix_process_queue(&k, w.pubkey(), epoch)), *who, expect)
            }
            Op::ClaimQueue { who } => {
                let w = &self.wallets[*who];
                match self.chain.entry_pos(&w.pubkey()) {
                    None => (None, *who, Expect::Skip),
                    Some(p) => {
                        let owed = m.owed(&p);
                        let expect = if owed == 0 {
                            Expect::Err("NothingToClaim")
                        } else {
                            m.queue_sol -= owed;
                            Expect::Ok
                        };
                        (Some(ix_claim_queue(&k, w.pubkey(), p.epoch)), *who, expect)
                    }
                }
            }
            Op::CancelQueue { who } => {
                let w = &self.wallets[*who];
                match self.chain.entry_pos(&w.pubkey()) {
                    None => (None, *who, Expect::Skip),
                    Some(p) => {
                        let (rem, owed) = m.leave(&p);
                        let expect = if rem == 0 && owed == 0 {
                            Expect::Err("NothingToClaim")
                        } else {
                            m.queue_sol -= owed;
                            Expect::Ok
                        };
                        (Some(ix_cancel_queue(&k, w.pubkey(), p.epoch)), *who, expect)
                    }
                }
            }
            Op::QueueToRedeem { who } => {
                let w = &self.wallets[*who];
                match self.chain.entry_pos(&w.pubkey()) {
                    None => (None, *who, Expect::Skip),
                    Some(p) => {
                        let expect = if m.phase != 1 {
                            Expect::Err("WrongPhase")
                        } else {
                            let (rem, owed) = m.leave(&p);
                            let mut paid = owed;
                            let mut err = None;
                            if rem > 0 {
                                match fc::redeem(&P, &m.pool, m.acc.queued_total, m.supply, rem) {
                                    Ok(q) => {
                                        m.redeem(rem);
                                        paid += q.sol_out;
                                    }
                                    Err(e) => err = Some(core_err_name(e)),
                                }
                            }
                            if let Some(e) = err {
                                Expect::Err(e)
                            } else if paid == 0 {
                                Expect::Err("NothingToClaim")
                            } else {
                                m.queue_sol -= owed;
                                Expect::Ok
                            }
                        };
                        (Some(ix_queue_to_redeem(&k, w.pubkey(), p.epoch)), *who, expect)
                    }
                }
            }
            Op::ClaimCreatorFees => {
                let expect = if m.creator_fees_owed == 0 {
                    Expect::Err("NothingToClaim")
                } else {
                    m.creator_fees_claimed += m.creator_fees_owed;
                    m.creator_fees_owed = 0;
                    Expect::Ok
                };
                (Some(ix_claim_creator_fees(&k, self.chain.creator.pubkey())), usize::MAX, expect)
            }
            Op::ClaimProtocolFees { who } => {
                let expect = if m.protocol_fees_owed == 0 {
                    Expect::Err("NothingToClaim")
                } else {
                    m.protocol_fees_claimed += m.protocol_fees_owed;
                    m.protocol_fees_owed = 0;
                    Expect::Ok
                };
                (Some(ix_claim_protocol_fees(&k, self.wallets[*who].pubkey(), self.chain.recipient.pubkey())), *who, expect)
            }
            Op::UpdateConfig => {
                // Defaults for future coins change; this coin must not notice.
                let mut p = P;
                p.brake_drop_bps = 1_000 + (self.step_no % 5_000) as u16;
                (Some(ix_update_config(self.chain.authority.pubkey(), Some(&p), None, None, None, None)), usize::MAX - 1, Expect::Ok)
            }
            Op::Warp(_) => unreachable!(),
        };

        let Some(ix) = ix else {
            self.stats.skipped += 1;
            return;
        };
        if matches!(expect, Expect::Ok) {
            self.chain.model = local;
        }

        let signer_kp: Keypair = match signer {
            usize::MAX => self.chain.creator.insecure_clone(),
            x if x == usize::MAX - 1 => self.chain.authority.insecure_clone(),
            i => self.wallets[i].insecure_clone(),
        };
        let res = self.chain.send_big(&[ix], &[&signer_kp]);
        self.stats.sent += 1;
        let ctx = self.ctx();

        match (&expect, &res) {
            (Expect::Ok, Ok(meta)) => {
                self.stats.ok += 1;
                self.stats.by_kind.entry(kind).or_insert((0, 0)).1 += 1;
                let cu = meta.compute_units_consumed;
                if cu > self.stats.max_cu {
                    self.stats.max_cu = cu;
                    self.stats.max_cu_op = format!("{op:?}");
                }
                assert!(cu <= 400_000, "{ctx}: {op:?} used {cu} CU");
            }
            (Expect::Err(name), Err(fail)) => {
                self.stats.refused += 1;
                let logs = fail.meta.logs.join("\n");
                assert!(logs.contains(name), "{ctx}: {op:?} expected error {name}, got:\n{logs}\n{:?}", fail.err);
                // a refused transaction changes nothing on chain (but still costs the fee)
                self.chain.model = before_model.clone();
                for (addr, acc) in &before_snapshot {
                    let now = self.chain.account(addr);
                    let same = match (acc, &now) {
                        (None, None) => true,
                        (Some(a), Some(b)) => {
                            let fee_payer = *addr == signer_kp.pubkey();
                            a.data == b.data && a.owner == b.owner && (if fee_payer { a.lamports == b.lamports + SIG_FEE } else { a.lamports == b.lamports })
                        }
                        _ => false,
                    };
                    assert!(same, "{ctx}: {op:?} was refused but account {addr} changed");
                }
            }
            (Expect::Ok, Err(fail)) => {
                let logs = fail.meta.logs.join("\n");
                panic!("{ctx}: {op:?} must succeed but failed:\n{logs}\n{:?}\nmodel before: {before_model:?}", fail.err);
            }
            (Expect::Err(name), Ok(_)) => {
                panic!("{ctx}: {op:?} must fail with {name} but succeeded\nmodel before: {before_model:?}");
            }
            (Expect::Skip, _) => unreachable!(),
        }

        // Program-level errors that are always bugs.
        if let Err(fail) = &res {
            let logs = fail.meta.logs.join("\n");
            for bad in ["Overflow", "VaultAccounting", "arithmetic", "panicked", "ProgramFailedToComplete", "InvalidVault", "AccountDidNotSerialize"] {
                assert!(!logs.contains(bad), "{ctx}: {op:?} hit a program bug ({bad}):\n{logs}");
            }
        }

        // Lamport conservation across everything the program can touch.
        let after_total = self.total_lamports();
        assert_eq!(before_total, after_total + SIG_FEE as u128, "{ctx}: {op:?} created or destroyed lamports ({} → {})", before_total, after_total);

        // State mirror (only meaningful after a success; after a refusal the model was restored).
        self.chain.assert_mirror();

        // Redeem oracles.
        if matches!(expect, Expect::Ok) && matches!(op, Op::Redeem { .. } | Op::QueueToRedeem { .. }) {
            if let (Some((f0, p0)), Some((f1, p1))) = (before_fp, self.floor_and_price()) {
                if matches!(op, Op::Redeem { .. }) {
                    assert!(f1 >= f0, "{ctx}: {op:?} lowered the floor {f0} → {f1}");
                }
                assert!(p1 >= p0, "{ctx}: {op:?} lowered the pool price {p0} → {p1}");
            }
        }
        if matches!(expect, Expect::Ok) {
            self.log.push(format!("{} {:?}", self.step_no, op));
            if self.log.len() > 40 {
                self.log.remove(0);
            }
        }
    }

    /// Run `steps` random ops. Returns the stats.
    pub fn run(&mut self, steps: u64) {
        // Make sure the curve usually graduates within a run: front-load buys.
        for _ in 0..steps {
            let op = self.pick();
            self.step(op);
        }
    }

    pub fn summary(&self) -> String {
        let s = &self.stats;
        let mut out = format!(
            "seed {}: {} steps, {} sent, {} ok, {} refused, {} skipped, phase {}, epoch {}, max CU {} ({})\n",
            self.seed, s.steps, s.sent, s.ok, s.refused, s.skipped, self.chain.model.phase, self.chain.model.acc.epoch, s.max_cu, s.max_cu_op
        );
        for (k, (n, ok)) in &s.by_kind {
            out.push_str(&format!("  {k:<20} {n:>5} picked {ok:>5} ok\n"));
        }
        out
    }
}
