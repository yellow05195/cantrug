//! # floored-core
//!
//! Every number FLOORED moves on-chain is decided here, in pure integer
//! arithmetic, with no Solana dependency. The Anchor program is a thin wrapper
//! that validates accounts and applies the deltas this crate returns; the
//! TypeScript SDK ports the same functions and is checked against the vectors
//! this crate emits (see `tests.rs` / `vectors`).
//!
//! Three mechanisms:
//!
//! 1. **The curve** (`curve_buy`, `curve_sell`): a constant-product bonding
//!    curve with virtual reserves, Pump-style. 1 % fee in SOL, split between
//!    creator, protocol and the *floor reserve* that is poured into the pool at
//!    graduation.
//! 2. **The pool** (`pool_buy`, `pool_sell`): a constant-product pool owned by
//!    the program. No LP token exists. 0.5 % fee, part of which stays in the
//!    pool, so every trade lifts the floor.
//! 3. **The floor** (`redeem`): any holder burns `x` tokens and receives
//!    `S·x/C` SOL from the pool, where `S` is the pool SOL, `C` the circulating
//!    supply. The pool burns `T·x/C` of its own tokens in the same step, so the
//!    pool price does not move and the floor of everyone else does not fall.
//!
//! and the **brake** (`brake_allowed`, `QueueAcc`): no sale or group of sales
//! may push the price more than `brake_drop_bps` below the price at the start
//! of the current window. What does not fit is queued and served pro rata of
//! size, through one aggregate swap per window, so every queued seller gets
//! the same fill percentage at the same price.
//!
//! Rounding rule, everywhere: in favour of the pool. Amounts paid out are
//! floored, fees are ceiled, pool tokens burned on redeem are ceiled.

#![forbid(unsafe_code)]
#![warn(clippy::arithmetic_side_effects)]

#[cfg(test)]
mod tests;

/// Token decimals. 1 token = 10^6 base units.
pub const DECIMALS: u8 = 6;
/// Total supply minted once at creation, in base units (1 000 000 000 tokens).
pub const TOTAL_SUPPLY: u64 = 1_000_000_000 * 1_000_000;
pub const LAMPORTS_PER_SOL: u64 = 1_000_000_000;
/// Basis points denominator.
pub const BPS: u128 = 10_000;
/// Fixed-point unit of the queue accumulator (`QueueAcc::scale` starts here).
pub const SCALE_ONE: u128 = 1u128 << 64;

// ─────────────────────────────── errors ───────────────────────────────

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CoreError {
    Overflow,
    DivisionByZero,
    ZeroAmount,
    /// Output rounds to nothing: the trade is too small to be paid.
    DustOutput,
    /// Curve already collected its graduation SOL / sold its supply.
    CurveComplete,
    CurveNotComplete,
    /// Selling more than the curve ever sold or than the circulation holds.
    ExceedsAvailable,
    /// `C == 0`: nobody holds tokens outside the pool, nothing to redeem.
    NothingInCirculation,
    InvalidParams,
    /// Queue accumulator asked to fill more than is queued.
    ExceedsQueue,
}

pub type CoreResult<T> = Result<T, CoreError>;

// ─────────────────────────────── params ───────────────────────────────

/// Per-coin parameters. Copied from `GlobalConfig` into `CoinState` at
/// creation and never modified afterwards.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Params {
    /// Virtual SOL reserve of the curve, lamports (default 30 SOL).
    pub virtual_sol: u64,
    /// Virtual token reserve of the curve, base units (default 1 073 000 000 tokens).
    pub virtual_tok: u64,
    /// Tokens sold on the curve before graduation (default 793 100 000 tokens).
    pub curve_supply: u64,
    /// Real SOL that completes the curve (default 85 SOL).
    pub graduation_sol: u64,
    /// Curve trade fee (default 100 = 1 %).
    pub curve_fee_bps: u16,
    /// Share of the curve fee that goes to the creator (default 4 000 = 40 % of fee = 0.4 %).
    pub curve_fee_creator_share_bps: u16,
    /// Share of the curve fee that goes to the protocol (default 3 000). The rest is the floor reserve.
    pub curve_fee_protocol_share_bps: u16,
    /// Pool swap fee (default 50 = 0.5 %).
    pub pool_fee_bps: u16,
    /// Share of the pool fee that stays in the pool (default 4 000 = 0.2 % of the trade).
    pub pool_fee_pool_share_bps: u16,
    /// Share of the pool fee that goes to the creator (default 4 000). The rest goes to the protocol.
    pub pool_fee_creator_share_bps: u16,
    /// Exit fee on `redeem`, kept in the pool (default 50 = 0.5 %).
    pub redeem_fee_bps: u16,
    /// Maximum price drop per brake window (default 2 000 = 20 %).
    pub brake_drop_bps: u16,
    /// Brake window length in slots (default 150 ≈ 60 s).
    pub brake_window_slots: u64,
}

impl Params {
    pub const DEFAULT: Params = Params {
        virtual_sol: 30 * LAMPORTS_PER_SOL,
        virtual_tok: 1_073_000_000 * 1_000_000,
        curve_supply: 793_100_000 * 1_000_000,
        graduation_sol: 85 * LAMPORTS_PER_SOL,
        curve_fee_bps: 100,
        curve_fee_creator_share_bps: 4_000,
        curve_fee_protocol_share_bps: 3_000,
        pool_fee_bps: 50,
        pool_fee_pool_share_bps: 4_000,
        pool_fee_creator_share_bps: 4_000,
        redeem_fee_bps: 50,
        brake_drop_bps: 2_000,
        brake_window_slots: 150,
    };

    pub fn validate(&self) -> CoreResult<()> {
        let ok = self.virtual_sol > 0
            && self.virtual_tok > self.curve_supply
            && self.curve_supply > 0
            && self.curve_supply < TOTAL_SUPPLY
            && self.graduation_sol > 0
            && u128::from(self.curve_fee_bps) < BPS
            && u128::from(self.curve_fee_creator_share_bps)
                .saturating_add(u128::from(self.curve_fee_protocol_share_bps))
                <= BPS
            && u128::from(self.pool_fee_bps) < BPS
            && u128::from(self.pool_fee_pool_share_bps)
                .saturating_add(u128::from(self.pool_fee_creator_share_bps))
                <= BPS
            && u128::from(self.redeem_fee_bps) < BPS
            && self.brake_drop_bps > 0
            && u128::from(self.brake_drop_bps) < BPS
            && self.brake_window_slots > 0;
        if ok {
            Ok(())
        } else {
            Err(CoreError::InvalidParams)
        }
    }
}

impl Default for Params {
    fn default() -> Self {
        Self::DEFAULT
    }
}

// ─────────────────────────────── integer helpers ───────────────────────────────

#[inline]
pub fn mul_div_floor(a: u128, b: u128, c: u128) -> CoreResult<u128> {
    if c == 0 {
        return Err(CoreError::DivisionByZero);
    }
    a.checked_mul(b).ok_or(CoreError::Overflow)?.checked_div(c).ok_or(CoreError::DivisionByZero)
}

#[inline]
pub fn mul_div_ceil(a: u128, b: u128, c: u128) -> CoreResult<u128> {
    if c == 0 {
        return Err(CoreError::DivisionByZero);
    }
    let p = a.checked_mul(b).ok_or(CoreError::Overflow)?;
    let q = p.checked_div(c).ok_or(CoreError::DivisionByZero)?;
    if p.checked_rem(c).ok_or(CoreError::DivisionByZero)? == 0 {
        Ok(q)
    } else {
        q.checked_add(1).ok_or(CoreError::Overflow)
    }
}

#[inline]
pub fn to_u64(v: u128) -> CoreResult<u64> {
    u64::try_from(v).map_err(|_| CoreError::Overflow)
}

#[inline]
fn add64(a: u64, b: u64) -> CoreResult<u64> {
    a.checked_add(b).ok_or(CoreError::Overflow)
}

#[inline]
fn sub64(a: u64, b: u64) -> CoreResult<u64> {
    a.checked_sub(b).ok_or(CoreError::Overflow)
}

/// `ceil(amount · bps / 10 000)`: fees always round up.
#[inline]
pub fn fee_ceil(amount: u64, bps: u16) -> CoreResult<u64> {
    to_u64(mul_div_ceil(u128::from(amount), u128::from(bps), BPS)?)
}

/// `floor(amount · bps / 10 000)`: shares of a fee round down; the remainder goes to the pool side.
#[inline]
pub fn share_floor(amount: u64, bps: u16) -> CoreResult<u64> {
    to_u64(mul_div_floor(u128::from(amount), u128::from(bps), BPS)?)
}

/// Integer square root, floor. Newton iteration, converges in ≤ 64 steps on u128.
#[allow(clippy::arithmetic_side_effects)] // n / x with x ≥ 1, and 128 − leading_zeros ≤ 128
pub fn isqrt(n: u128) -> u128 {
    if n < 2 {
        return n;
    }
    // Initial guess: 2^(ceil(bits/2)) ≥ sqrt(n).
    let bits = 128 - n.leading_zeros();
    let mut x: u128 = 1u128 << bits.div_ceil(2);
    loop {
        let y = (x.saturating_add(n / x)) / 2;
        if y >= x {
            return x;
        }
        x = y;
    }
}

// ─────────────────────────────── fee split ───────────────────────────────

/// Where a fee goes. `pool` is the part that stays with the holders (floor
/// reserve during the curve, pool SOL after graduation).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct FeeSplit {
    pub total: u64,
    pub creator: u64,
    pub protocol: u64,
    pub pool: u64,
}

fn split_curve_fee(p: &Params, fee: u64) -> CoreResult<FeeSplit> {
    let creator = share_floor(fee, p.curve_fee_creator_share_bps)?;
    let protocol = share_floor(fee, p.curve_fee_protocol_share_bps)?;
    let pool = sub64(sub64(fee, creator)?, protocol)?;
    Ok(FeeSplit { total: fee, creator, protocol, pool })
}

fn split_pool_fee(p: &Params, fee: u64) -> CoreResult<FeeSplit> {
    let pool = share_floor(fee, p.pool_fee_pool_share_bps)?;
    let creator = share_floor(fee, p.pool_fee_creator_share_bps)?;
    let protocol = sub64(sub64(fee, pool)?, creator)?;
    Ok(FeeSplit { total: fee, creator, protocol, pool })
}

// ─────────────────────────────── the curve ───────────────────────────────

/// Live state of a coin on the curve.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct CurveState {
    /// Real SOL collected (lamports), excluding fees.
    pub real_sol: u64,
    /// Tokens sold so far (base units).
    pub tokens_sold: u64,
}

impl CurveState {
    /// Virtual reserves `(vs, vt)` used for pricing.
    pub fn reserves(&self, p: &Params) -> CoreResult<(u64, u64)> {
        Ok((add64(p.virtual_sol, self.real_sol)?, sub64(p.virtual_tok, self.tokens_sold)?))
    }
    pub fn is_complete(&self, p: &Params) -> bool {
        self.real_sol >= p.graduation_sol || self.tokens_sold >= p.curve_supply
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct CurveBuy {
    /// SOL that enters the curve reserve.
    pub sol_net: u64,
    pub fee: FeeSplit,
    /// Total the buyer is charged (`sol_net + fee.total`). May be below what they offered (curve cap).
    pub sol_charged: u64,
    pub tokens_out: u64,
    /// The curve is complete after this buy; `graduate` can be called.
    pub completes: bool,
}

/// Quote a buy of at most `sol_max` lamports (fee included) on the curve.
pub fn curve_buy(p: &Params, s: &CurveState, sol_max: u64) -> CoreResult<CurveBuy> {
    if sol_max == 0 {
        return Err(CoreError::ZeroAmount);
    }
    if s.is_complete(p) {
        return Err(CoreError::CurveComplete);
    }
    let (vs, vt) = s.reserves(p)?;
    let capacity_sol = sub64(p.graduation_sol, s.real_sol)?;
    let remaining_tokens = sub64(p.curve_supply, s.tokens_sold)?;

    // Net of fee: user pays net + ceil(net · f) ≤ sol_max.
    let fee_bps = u128::from(p.curve_fee_bps);
    let mut net = to_u64(mul_div_floor(u128::from(sol_max), BPS, BPS.checked_add(fee_bps).ok_or(CoreError::Overflow)?)?)?;
    // Guard the ceil on the fee pushing the total one lamport over sol_max.
    while net > 0 && add64(net, fee_ceil(net, p.curve_fee_bps)?)? > sol_max {
        net = sub64(net, 1)?;
    }
    if net == 0 {
        return Err(CoreError::ZeroAmount);
    }
    net = net.min(capacity_sol);

    let mut tokens_out = to_u64(mul_div_floor(u128::from(vt), u128::from(net), u128::from(add64(vs, net)?))?)?;
    if tokens_out > remaining_tokens {
        // Buy exactly the remaining tokens: Δs = ceil(vs · Δt / (vt − Δt)).
        tokens_out = remaining_tokens;
        let need = to_u64(mul_div_ceil(u128::from(vs), u128::from(tokens_out), u128::from(sub64(vt, tokens_out)?))?)?;
        if need > capacity_sol {
            net = capacity_sol;
            tokens_out = to_u64(mul_div_floor(u128::from(vt), u128::from(net), u128::from(add64(vs, net)?))?)?;
        } else {
            net = need;
        }
    }
    if tokens_out == 0 {
        return Err(CoreError::DustOutput);
    }
    let fee = split_curve_fee(p, fee_ceil(net, p.curve_fee_bps)?)?;
    let sol_charged = add64(net, fee.total)?;
    let after = CurveState { real_sol: add64(s.real_sol, net)?, tokens_sold: add64(s.tokens_sold, tokens_out)? };
    Ok(CurveBuy { sol_net: net, fee, sol_charged, tokens_out, completes: after.is_complete(p) })
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct CurveSell {
    /// SOL leaving the curve reserve (before fee).
    pub sol_gross: u64,
    pub fee: FeeSplit,
    /// SOL the seller receives.
    pub sol_net: u64,
}

/// Quote a sale of `tokens_in` base units into the curve.
pub fn curve_sell(p: &Params, s: &CurveState, tokens_in: u64) -> CoreResult<CurveSell> {
    if tokens_in == 0 {
        return Err(CoreError::ZeroAmount);
    }
    if tokens_in > s.tokens_sold {
        return Err(CoreError::ExceedsAvailable);
    }
    let (vs, vt) = s.reserves(p)?;
    let gross = to_u64(mul_div_floor(u128::from(vs), u128::from(tokens_in), u128::from(add64(vt, tokens_in)?))?)?;
    // Mathematically gross ≤ real_sol (k only grows); the clamp is belt and braces.
    let gross = gross.min(s.real_sol);
    let fee = split_curve_fee(p, fee_ceil(gross, p.curve_fee_bps)?)?;
    let net = sub64(gross, fee.total)?;
    if net == 0 {
        return Err(CoreError::DustOutput);
    }
    Ok(CurveSell { sol_gross: gross, fee, sol_net: net })
}

// ─────────────────────────────── graduation ───────────────────────────────

/// Pool reserves opened at graduation: all real curve SOL plus the floor
/// reserve, and every token the curve did not sell. Nothing is burned.
pub fn graduation_pool(p: &Params, s: &CurveState, floor_reserve: u64) -> CoreResult<PoolState> {
    if !s.is_complete(p) {
        return Err(CoreError::CurveNotComplete);
    }
    Ok(PoolState { sol: add64(s.real_sol, floor_reserve)?, tok: sub64(TOTAL_SUPPLY, s.tokens_sold)? })
}

// ─────────────────────────────── the pool ───────────────────────────────

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct PoolState {
    /// SOL in the pool, lamports (`S`).
    pub sol: u64,
    /// Tokens in the pool, base units (`T`).
    pub tok: u64,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct PoolBuy {
    pub sol_net: u64,
    pub fee: FeeSplit,
    pub tokens_out: u64,
    pub after: PoolState,
}

/// Quote a pool buy with `sol_in` lamports (fee included).
pub fn pool_buy(p: &Params, pool: &PoolState, sol_in: u64) -> CoreResult<PoolBuy> {
    if sol_in == 0 {
        return Err(CoreError::ZeroAmount);
    }
    if pool.sol == 0 || pool.tok == 0 {
        return Err(CoreError::ExceedsAvailable);
    }
    let fee = split_pool_fee(p, fee_ceil(sol_in, p.pool_fee_bps)?)?;
    let net = sub64(sol_in, fee.total)?;
    if net == 0 {
        return Err(CoreError::ZeroAmount);
    }
    let tokens_out = to_u64(mul_div_floor(u128::from(pool.tok), u128::from(net), u128::from(add64(pool.sol, net)?))?)?;
    if tokens_out == 0 {
        return Err(CoreError::DustOutput);
    }
    let after = PoolState { sol: add64(add64(pool.sol, net)?, fee.pool)?, tok: sub64(pool.tok, tokens_out)? };
    Ok(PoolBuy { sol_net: net, fee, tokens_out, after })
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct PoolSell {
    pub sol_gross: u64,
    pub fee: FeeSplit,
    pub sol_net: u64,
    pub after: PoolState,
}

/// Quote a pool sale of `tokens_in` base units.
pub fn pool_sell(p: &Params, pool: &PoolState, tokens_in: u64) -> CoreResult<PoolSell> {
    if tokens_in == 0 {
        return Err(CoreError::ZeroAmount);
    }
    if pool.sol == 0 || pool.tok == 0 {
        return Err(CoreError::ExceedsAvailable);
    }
    let gross = to_u64(mul_div_floor(u128::from(pool.sol), u128::from(tokens_in), u128::from(add64(pool.tok, tokens_in)?))?)?;
    let fee = split_pool_fee(p, fee_ceil(gross, p.pool_fee_bps)?)?;
    let net = sub64(gross, fee.total)?;
    if net == 0 {
        return Err(CoreError::DustOutput);
    }
    // The pool keeps its share of the fee: S' = S − gross + fee.pool.
    let after = PoolState { sol: add64(sub64(pool.sol, gross)?, fee.pool)?, tok: add64(pool.tok, tokens_in)? };
    Ok(PoolSell { sol_gross: gross, fee, sol_net: net, after })
}

// ─────────────────────────────── the floor ───────────────────────────────

/// Tokens in circulation: everything outside the pool and the brake queue.
pub fn circulating(supply: u64, pool_tok: u64, queued: u64) -> CoreResult<u64> {
    sub64(sub64(supply, pool_tok)?, queued)
}

/// Floor per token as a Q64.64 fixed-point number of lamports per base unit
/// (`S · 2^64 / C`). Display helper; the program never needs it.
pub fn floor_q64(pool_sol: u64, circ: u64) -> CoreResult<u128> {
    mul_div_floor(u128::from(pool_sol), SCALE_ONE, u128::from(circ))
}

/// Pool price as Q64.64 lamports per base unit (`S · 2^64 / T`).
pub fn price_q64(sol: u64, tok: u64) -> CoreResult<u128> {
    mul_div_floor(u128::from(sol), SCALE_ONE, u128::from(tok))
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Redeem {
    /// Circulating supply before the redemption (`C`).
    pub circulating: u64,
    /// Gross share of the pool, `floor(S · x / C)`.
    pub sol_gross: u64,
    /// Exit fee, stays in the pool. Zero for the last holder.
    pub fee_kept: u64,
    /// SOL paid to the holder.
    pub sol_out: u64,
    /// Pool tokens burned alongside, `ceil(T · x / C)` (all of `T` for the last holder).
    pub pool_burn: u64,
    pub after: PoolState,
    /// Mint supply after both burns.
    pub supply_after: u64,
}

/// Quote `redeem(x)`: burn `x` tokens, receive the exact share of the pool SOL.
///
/// Invariants (proved in tests): the floor of the remaining holders never
/// decreases, the pool price never decreases, the last holder receives all the
/// SOL left.
pub fn redeem(p: &Params, pool: &PoolState, queued: u64, supply: u64, x: u64) -> CoreResult<Redeem> {
    if x == 0 {
        return Err(CoreError::ZeroAmount);
    }
    let c = circulating(supply, pool.tok, queued)?;
    if c == 0 {
        return Err(CoreError::NothingInCirculation);
    }
    if x > c {
        return Err(CoreError::ExceedsAvailable);
    }
    let last = x == c;
    let gross = if last { pool.sol } else { to_u64(mul_div_floor(u128::from(pool.sol), u128::from(x), u128::from(c))?)? };
    let fee_kept = if last { 0 } else { fee_ceil(gross, p.redeem_fee_bps)? };
    let sol_out = sub64(gross, fee_kept)?;
    if sol_out == 0 {
        return Err(CoreError::DustOutput);
    }
    let pool_burn = if last {
        pool.tok
    } else {
        to_u64(mul_div_ceil(u128::from(pool.tok), u128::from(x), u128::from(c))?)?.min(pool.tok)
    };
    let after = PoolState { sol: sub64(pool.sol, sol_out)?, tok: sub64(pool.tok, pool_burn)? };
    let supply_after = sub64(sub64(supply, x)?, pool_burn)?;
    Ok(Redeem { circulating: c, sol_gross: gross, fee_kept, sol_out, pool_burn, after, supply_after })
}

// ─────────────────────────────── the brake ───────────────────────────────

/// How many tokens may still be sold into reserves `(sol, tok)` before the
/// price falls below `(1 − drop) ×` the reference price `ref_sol / ref_tok`.
///
/// With constant product `k = sol · tok`, after selling `d` tokens the price is
/// `k / (tok + d)²`. The limit `tok_max` solves `k / tok_max² = ref_price · (1 − drop)`,
/// i.e. `tok_max² = tok · (sol · ref_tok / ref_sol) · BPS / (BPS − drop)`.
/// Works for the curve (virtual reserves) and for the pool alike.
pub fn brake_allowed(drop_bps: u16, ref_sol: u64, ref_tok: u64, sol: u64, tok: u64) -> CoreResult<u64> {
    if ref_sol == 0 || ref_tok == 0 || sol == 0 || tok == 0 {
        return Ok(0);
    }
    let keep = BPS.checked_sub(u128::from(drop_bps)).ok_or(CoreError::InvalidParams)?;
    if keep == 0 {
        return Err(CoreError::InvalidParams);
    }
    // r = sol · ref_tok / ref_sol  (≈ tok when the price has not moved since the reference)
    let r = mul_div_floor(u128::from(sol), u128::from(ref_tok), u128::from(ref_sol))?;
    let tok_max_sq = mul_div_floor(u128::from(tok).checked_mul(r).ok_or(CoreError::Overflow)?, BPS, keep)?;
    let tok_max = isqrt(tok_max_sq);
    to_u64(tok_max.saturating_sub(u128::from(tok)))
}

/// Pro-rata queue accumulator.
///
/// Every queued order is a number of `shares`; the tokens still queued behind
/// a share are `scale / 2^64`, and the SOL earned per share since the epoch
/// started is `sol_index / 2^64`. One aggregate swap per window updates the
/// two numbers; every order is then settled lazily from its own `shares`,
/// `sol_index_at_join` and `epoch`. When a window empties the queue the epoch
/// closes (its final `sol_index` is recorded by the program) and a fresh one
/// starts, so `scale` never degenerates.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct QueueAcc {
    pub epoch: u32,
    pub scale: u128,
    pub sol_index: u128,
    /// Tokens queued (base units), the `Q` of the floor formula.
    pub queued_total: u64,
}

impl Default for QueueAcc {
    fn default() -> Self {
        QueueAcc { epoch: 0, scale: SCALE_ONE, sol_index: 0, queued_total: 0 }
    }
}

/// A seller's position in the queue.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct QueuePosition {
    pub epoch: u32,
    pub shares: u128,
    pub sol_index_at_join: u128,
}

/// Result of one window fill.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct QueueFill {
    /// The queue is empty after this fill; the epoch is closed.
    pub closed_epoch: bool,
    /// Final `sol_index` of the closed epoch (meaningful when `closed_epoch`).
    pub final_sol_index: u128,
    /// Epoch number that was closed.
    pub epoch: u32,
}

impl QueueAcc {
    /// Add `amount` tokens to the queue; returns the position to store.
    pub fn join(&mut self, amount: u64) -> CoreResult<QueuePosition> {
        if amount == 0 {
            return Err(CoreError::ZeroAmount);
        }
        if self.scale == 0 {
            return Err(CoreError::InvalidParams);
        }
        let shares = mul_div_floor(u128::from(amount), SCALE_ONE, self.scale)?;
        self.queued_total = add64(self.queued_total, amount)?;
        Ok(QueuePosition { epoch: self.epoch, shares, sol_index_at_join: self.sol_index })
    }

    /// Record that the aggregate swap sold `sold` queued tokens for `sol_out` lamports.
    pub fn fill(&mut self, sold: u64, sol_out: u64) -> CoreResult<QueueFill> {
        if sold == 0 {
            return Err(CoreError::ZeroAmount);
        }
        if sold > self.queued_total {
            return Err(CoreError::ExceedsQueue);
        }
        let delta = mul_div_floor(u128::from(sol_out), self.scale, u128::from(self.queued_total))?;
        self.sol_index = self.sol_index.checked_add(delta).ok_or(CoreError::Overflow)?;
        let remaining = sub64(self.queued_total, sold)?;
        let new_scale = mul_div_floor(self.scale, u128::from(remaining), u128::from(self.queued_total))?;
        if remaining == 0 || new_scale == 0 {
            let fill = QueueFill { closed_epoch: true, final_sol_index: self.sol_index, epoch: self.epoch };
            self.epoch = self.epoch.checked_add(1).ok_or(CoreError::Overflow)?;
            self.scale = SCALE_ONE;
            self.sol_index = 0;
            self.queued_total = 0;
            return Ok(fill);
        }
        self.scale = new_scale;
        self.queued_total = remaining;
        Ok(QueueFill { closed_epoch: false, final_sol_index: 0, epoch: self.epoch })
    }

    /// Remove a position that is still in the current epoch (cancel / switch to redeem).
    /// Returns `(tokens_remaining, sol_owed)`.
    pub fn leave(&mut self, pos: &QueuePosition) -> CoreResult<(u64, u64)> {
        if pos.epoch != self.epoch {
            return Err(CoreError::InvalidParams);
        }
        let remaining = entry_remaining(pos, self.scale)?;
        let owed = entry_owed(pos, self.sol_index)?;
        self.queued_total = sub64(self.queued_total, remaining)?;
        Ok((remaining, owed))
    }
}

/// Tokens still queued behind a position, given the live (or final) `scale`.
pub fn entry_remaining(pos: &QueuePosition, scale: u128) -> CoreResult<u64> {
    to_u64(mul_div_floor(pos.shares, scale, SCALE_ONE)?)
}

/// SOL earned by a position, given the live (or final) `sol_index`.
pub fn entry_owed(pos: &QueuePosition, sol_index: u128) -> CoreResult<u64> {
    let d = sol_index.checked_sub(pos.sol_index_at_join).ok_or(CoreError::Overflow)?;
    to_u64(mul_div_floor(pos.shares, d, SCALE_ONE)?)
}

/// Start of the window that contains `slot`, given the previous window start.
/// Windows are anchored on the first one and tiled, so a quiet coin does not
/// drift: `start + n·len ≤ slot < start + (n+1)·len`.
pub fn window_start(prev_start: u64, window_slots: u64, slot: u64) -> u64 {
    if window_slots == 0 || slot <= prev_start {
        return prev_start;
    }
    let elapsed = slot.saturating_sub(prev_start);
    prev_start.saturating_add(elapsed.saturating_sub(elapsed.checked_rem(window_slots).unwrap_or(0)))
}
