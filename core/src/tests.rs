//! Unit tests and property tests of the three invariants the project promises:
//!
//!   I1. `redeem` never lowers the floor of the remaining holders.
//!   I2. `redeem` never lowers the pool price.
//!   I3. the brake queue is served pro rata of size, at one price per window.
//!
//! plus the curve / pool accounting (SOL is conserved to the lamport, k never
//! decreases, fees add up) and the brake bound itself.

use super::*;
use proptest::prelude::*;

const SOL: u64 = LAMPORTS_PER_SOL;
const P: Params = Params::DEFAULT;

fn tok(n: u64) -> u64 {
    n * 1_000_000
}

// ───────────────────────── helpers that replay a whole coin ─────────────────────────

#[derive(Clone, Debug)]
struct Coin {
    curve: CurveState,
    floor_reserve: u64,
    creator_fees: u64,
    protocol_fees: u64,
    pool: Option<PoolState>,
    supply: u64,
    queue: QueueAcc,
}

impl Coin {
    fn new() -> Coin {
        Coin {
            curve: CurveState::default(),
            floor_reserve: 0,
            creator_fees: 0,
            protocol_fees: 0,
            pool: None,
            supply: TOTAL_SUPPLY,
            queue: QueueAcc::default(),
        }
    }
    fn buy(&mut self, sol: u64) -> CoreResult<CurveBuy> {
        let q = curve_buy(&P, &self.curve, sol)?;
        self.curve.real_sol += q.sol_net;
        self.curve.tokens_sold += q.tokens_out;
        self.floor_reserve += q.fee.pool;
        self.creator_fees += q.fee.creator;
        self.protocol_fees += q.fee.protocol;
        Ok(q)
    }
    fn sell(&mut self, t: u64) -> CoreResult<CurveSell> {
        let q = curve_sell(&P, &self.curve, t)?;
        self.curve.real_sol -= q.sol_gross;
        self.curve.tokens_sold -= t;
        self.floor_reserve += q.fee.pool;
        self.creator_fees += q.fee.creator;
        self.protocol_fees += q.fee.protocol;
        Ok(q)
    }
    fn graduate(&mut self) -> CoreResult<PoolState> {
        let pool = graduation_pool(&P, &self.curve, self.floor_reserve)?;
        self.pool = Some(pool);
        Ok(pool)
    }
    fn fill_curve(&mut self) {
        while !self.curve.is_complete(&P) {
            self.buy(10 * SOL).unwrap();
        }
        self.graduate().unwrap();
    }
    fn pool(&self) -> PoolState {
        self.pool.unwrap()
    }
    fn circ(&self) -> u64 {
        circulating(self.supply, self.pool().tok, self.queue.queued_total).unwrap()
    }
    fn swap_buy(&mut self, sol: u64) -> CoreResult<PoolBuy> {
        let q = pool_buy(&P, &self.pool(), sol)?;
        self.pool = Some(q.after);
        self.creator_fees += q.fee.creator;
        self.protocol_fees += q.fee.protocol;
        Ok(q)
    }
    fn swap_sell(&mut self, t: u64) -> CoreResult<PoolSell> {
        let q = pool_sell(&P, &self.pool(), t)?;
        self.pool = Some(q.after);
        self.creator_fees += q.fee.creator;
        self.protocol_fees += q.fee.protocol;
        Ok(q)
    }
    fn redeem(&mut self, x: u64) -> CoreResult<Redeem> {
        let q = redeem(&P, &self.pool(), self.queue.queued_total, self.supply, x)?;
        self.pool = Some(q.after);
        self.supply = q.supply_after;
        Ok(q)
    }
}

// ───────────────────────── params & helpers ─────────────────────────

#[test]
fn default_params_are_valid_and_consistent_with_pump_numbers() {
    P.validate().unwrap();
    // Selling the whole curve supply at constant product collects ≈ 85 SOL real.
    let k = u128::from(P.virtual_sol) * u128::from(P.virtual_tok);
    let vt_end = u128::from(P.virtual_tok - P.curve_supply);
    let vs_end = k / vt_end;
    let real = vs_end - u128::from(P.virtual_sol);
    assert!((84 * SOL as u128..=86 * SOL as u128).contains(&real), "real SOL at curve end = {real}");
}

#[test]
fn isqrt_is_exact_floor() {
    for n in [0u128, 1, 2, 3, 4, 15, 16, 17, 1 << 64, (1 << 64) + 1, u128::MAX] {
        let r = isqrt(n);
        assert!(r * r <= n);
        assert!(r.checked_add(1).map_or(true, |r1| r1.checked_mul(r1).map_or(true, |sq| sq > n)));
    }
}

#[test]
fn fee_rounds_up_shares_round_down() {
    assert_eq!(fee_ceil(1, 100).unwrap(), 1);
    assert_eq!(fee_ceil(10_000, 100).unwrap(), 100);
    assert_eq!(fee_ceil(10_001, 100).unwrap(), 101);
    assert_eq!(share_floor(101, 4_000).unwrap(), 40);
}

#[test]
fn window_start_tiles_without_drift() {
    assert_eq!(window_start(1000, 150, 1000), 1000);
    assert_eq!(window_start(1000, 150, 1149), 1000);
    assert_eq!(window_start(1000, 150, 1150), 1150);
    assert_eq!(window_start(1000, 150, 1449), 1300);
    assert_eq!(window_start(1000, 150, 999), 1000);
}

// ───────────────────────── curve ─────────────────────────

#[test]
fn curve_buy_charges_fee_on_top_and_caps_at_graduation() {
    let mut c = Coin::new();
    let q = c.buy(SOL).unwrap();
    assert_eq!(q.fee.total, fee_ceil(q.sol_net, 100).unwrap());
    assert!(q.sol_charged <= SOL);
    assert_eq!(q.fee.creator + q.fee.protocol + q.fee.pool, q.fee.total);
    // First SOL buys ≈ 34.6M tokens (1073M · 1 / 31).
    assert!((tok(34_000_000)..tok(35_000_000)).contains(&q.tokens_out), "{}", q.tokens_out);

    c.fill_curve();
    assert_eq!(c.curve.real_sol, P.graduation_sol, "the last buy is capped exactly at 85 SOL");
    assert!(c.curve.tokens_sold <= P.curve_supply);
    assert!(c.curve.tokens_sold > tok(790_000_000));
    assert!(matches!(curve_buy(&P, &c.curve, SOL), Err(CoreError::CurveComplete)));
}

#[test]
fn curve_sell_returns_less_than_paid_and_k_never_decreases() {
    let mut c = Coin::new();
    let k0 = u128::from(P.virtual_sol) * u128::from(P.virtual_tok);
    let b = c.buy(5 * SOL).unwrap();
    let (vs, vt) = c.curve.reserves(&P).unwrap();
    assert!(u128::from(vs) * u128::from(vt) >= k0);
    let s = c.sell(b.tokens_out).unwrap();
    assert!(s.sol_net < b.sol_charged);
    assert!(s.sol_gross <= b.sol_net);
    let (vs, vt) = c.curve.reserves(&P).unwrap();
    assert!(u128::from(vs) * u128::from(vt) >= k0);
    assert!(matches!(curve_sell(&P, &c.curve, 1), Err(CoreError::ExceedsAvailable)));
}

#[test]
fn floor_at_graduation_equals_average_price_paid() {
    let mut c = Coin::new();
    let mut paid = 0u64;
    while !c.curve.is_complete(&P) {
        paid += c.buy(7 * SOL).unwrap().sol_net;
    }
    let pool = c.graduate().unwrap();
    assert_eq!(paid, c.curve.real_sol);
    let circ = c.circ();
    assert_eq!(circ, c.curve.tokens_sold);
    // floor = (real + floor_reserve) / sold  ≥  real / sold = average price, and within 0.5 % of it.
    let floor = floor_q64(pool.sol, circ).unwrap();
    let avg = floor_q64(paid, circ).unwrap();
    assert!(floor >= avg);
    assert!(floor - avg <= avg / 200);
    // and the pool opens at the curve's last price, lifted only by the floor reserve
    // (0.3 % of the curve volume): never lower, never more than 0.5 % higher.
    let (vs, vt) = c.curve.reserves(&P).unwrap();
    let curve_px = price_q64(vs, vt).unwrap();
    let pool_px = price_q64(pool.sol, pool.tok).unwrap();
    assert!(pool_px >= curve_px, "curve {curve_px} pool {pool_px}");
    assert!(pool_px - curve_px <= curve_px / 200, "curve {curve_px} pool {pool_px}");
    // nothing burned: pool tokens + sold == supply
    assert_eq!(pool.tok + c.curve.tokens_sold, TOTAL_SUPPLY);
}

// ───────────────────────── pool ─────────────────────────

#[test]
fn pool_trades_keep_fee_in_pool_and_lift_the_floor() {
    let mut c = Coin::new();
    c.fill_curve();
    let f0 = floor_q64(c.pool().sol, c.circ()).unwrap();
    let k0 = u128::from(c.pool().sol) * u128::from(c.pool().tok);
    let b = c.swap_buy(2 * SOL).unwrap();
    assert_eq!(b.fee.total, fee_ceil(2 * SOL, 50).unwrap());
    assert_eq!(b.fee.pool, share_floor(b.fee.total, 4_000).unwrap());
    let k1 = u128::from(c.pool().sol) * u128::from(c.pool().tok);
    assert!(k1 > k0);
    let f1 = floor_q64(c.pool().sol, c.circ()).unwrap();
    assert!(f1 > f0, "a buy lifts the floor (fee stays in pool and the buyer's tokens left the pool)");
    let s = c.swap_sell(b.tokens_out).unwrap();
    assert!(s.sol_net < 2 * SOL);
    let k2 = u128::from(c.pool().sol) * u128::from(c.pool().tok);
    assert!(k2 > k1);
    let f2 = floor_q64(c.pool().sol, c.circ()).unwrap();
    assert!(f2 > f0, "round trip: pool kept 0.2 % twice, floor is higher than before");
}

// ───────────────────────── redeem ─────────────────────────

#[test]
fn redeem_pays_exact_share_minus_half_percent_and_burns_pool_tokens() {
    let mut c = Coin::new();
    c.fill_curve();
    let pool = c.pool();
    let circ = c.circ();
    let x = tok(10_000_000);
    let q = c.redeem(x).unwrap();
    let gross = (u128::from(pool.sol) * u128::from(x) / u128::from(circ)) as u64;
    assert_eq!(q.sol_gross, gross);
    assert_eq!(q.fee_kept, fee_ceil(gross, 50).unwrap());
    assert_eq!(q.sol_out, gross - q.fee_kept);
    let burn = mul_div_ceil(u128::from(pool.tok), u128::from(x), u128::from(circ)).unwrap() as u64;
    assert_eq!(q.pool_burn, burn);
    assert_eq!(c.supply, TOTAL_SUPPLY - x - burn);
    assert_eq!(c.circ(), circ - x);
}

#[test]
fn redeem_errors() {
    let mut c = Coin::new();
    c.fill_curve();
    assert!(matches!(c.redeem(0), Err(CoreError::ZeroAmount)));
    let circ = c.circ();
    assert!(matches!(c.redeem(circ + 1), Err(CoreError::ExceedsAvailable)));
    // 1 base unit pays 0 lamports: dust.
    assert!(matches!(c.redeem(1), Err(CoreError::DustOutput)));
    // everyone leaves: C = 0 afterwards.
    c.redeem(circ).unwrap();
    assert!(matches!(c.redeem(1), Err(CoreError::NothingInCirculation)));
}

#[test]
fn last_holder_takes_everything_and_pool_is_empty() {
    let mut c = Coin::new();
    c.fill_curve();
    c.swap_buy(3 * SOL).unwrap();
    c.redeem(tok(100_000_000)).unwrap();
    let sol_before = c.pool().sol;
    let q = c.redeem(c.circ()).unwrap();
    assert_eq!(q.fee_kept, 0);
    assert_eq!(q.sol_out, sol_before);
    assert_eq!(c.pool(), PoolState { sol: 0, tok: 0 });
    assert_eq!(c.supply, 0);
}

#[test]
fn everyone_redeems_one_by_one_sol_is_conserved() {
    let mut c = Coin::new();
    c.fill_curve();
    let start = c.pool().sol;
    let mut paid = 0u64;
    let mut holders = vec![tok(300_000_000), tok(200_000_000), tok(150_000_000), tok(100_000_000)];
    holders.push(c.circ() - holders.iter().sum::<u64>());
    let mut floor_prev = floor_q64(c.pool().sol, c.circ()).unwrap();
    for (i, h) in holders.iter().enumerate() {
        let q = c.redeem(*h).unwrap();
        paid += q.sol_out;
        if i + 1 < holders.len() {
            let f = floor_q64(c.pool().sol, c.circ()).unwrap();
            assert!(f >= floor_prev, "floor fell from {floor_prev} to {f}");
            floor_prev = f;
        }
    }
    assert_eq!(paid, start, "every lamport of the pool went to holders");
}

#[test]
fn arbitrage_closes_when_price_dips_under_floor() {
    // Dump hard so the pool price falls under the floor, then show buy+redeem is profitable
    // and pushes the price back up toward the floor.
    let mut c = Coin::new();
    c.fill_curve();
    let whale = tok(400_000_000);
    c.swap_sell(whale).unwrap();
    let px = price_q64(c.pool().sol, c.pool().tok).unwrap();
    let fl = floor_q64(c.pool().sol, c.circ()).unwrap();
    assert!(px < fl, "after the dump the pool price {px} is under the floor {fl}");
    let spend = SOL;
    let b = c.swap_buy(spend).unwrap();
    let r = c.redeem(b.tokens_out).unwrap();
    assert!(r.sol_out > spend, "buy at pool then redeem at floor: {} in → {} out", spend, r.sol_out);
    let px2 = price_q64(c.pool().sol, c.pool().tok).unwrap();
    assert!(px2 > px);
}

// ───────────────────────── brake ─────────────────────────

#[test]
fn brake_bound_is_tight() {
    let s = 100 * SOL;
    let t = tok(200_000_000);
    let allowed = brake_allowed(2_000, s, t, s, t).unwrap();
    // ≈ (√1.25 − 1) · T = 11.80 %
    let pct = allowed as f64 / t as f64;
    assert!((0.1179..0.1181).contains(&pct), "{pct}");
    let k = u128::from(s) * u128::from(t);
    const Q32: u128 = 1 << 32;
    let ref_px = u128::from(s) * Q32 / u128::from(t);
    let limit = ref_px * 8_000 / 10_000;
    let px_after = |d: u64| {
        let t2 = u128::from(t + d);
        (k * Q32 / t2) / t2
    };
    assert!(px_after(allowed) >= limit, "selling exactly the allowance stays above −20 %");
    assert!(px_after(allowed + t / 1000) < limit, "selling 0.1 % more breaches it");
    // nothing more can be sold once at the limit
    let s2 = (k / u128::from(t + allowed)) as u64;
    assert_eq!(brake_allowed(2_000, s, t, s2, t + allowed).unwrap(), 0);
}

#[test]
fn brake_allowance_grows_after_buys_and_shrinks_after_sells() {
    let mut c = Coin::new();
    c.fill_curve();
    let p0 = c.pool();
    let a0 = brake_allowed(2_000, p0.sol, p0.tok, p0.sol, p0.tok).unwrap();
    c.swap_buy(5 * SOL).unwrap();
    let p1 = c.pool();
    let a1 = brake_allowed(2_000, p0.sol, p0.tok, p1.sol, p1.tok).unwrap();
    assert!(a1 > a0);
    c.swap_sell(a1 / 2).unwrap();
    let p2 = c.pool();
    let a2 = brake_allowed(2_000, p0.sol, p0.tok, p2.sol, p2.tok).unwrap();
    assert!(a2 < a1);
}

// ───────────────────────── queue ─────────────────────────

#[test]
fn queue_serves_pro_rata_at_one_price() {
    let mut q = QueueAcc::default();
    let a = q.join(tok(300_000_000)).unwrap();
    let b = q.join(tok(100_000_000)).unwrap();
    let c = q.join(tok(1)).unwrap();
    assert_eq!(q.queued_total, tok(400_000_001));
    // window 1: 10 % of the queue sells for 4 SOL
    let sold = q.queued_total / 10;
    let f = q.fill(sold, 4 * SOL).unwrap();
    assert!(!f.closed_epoch);
    let ra = entry_remaining(&a, q.scale).unwrap();
    let rb = entry_remaining(&b, q.scale).unwrap();
    let rc = entry_remaining(&c, q.scale).unwrap();
    // same fill percentage for the whale, the mid holder and the dust holder (±1 base unit)
    assert!((tok(300_000_000) - ra).abs_diff(3 * (tok(100_000_000) - rb)) <= 3);
    assert!((tok(1) - rc).abs_diff(tok(1) / 10) <= 1);
    let oa = entry_owed(&a, q.sol_index).unwrap();
    let ob = entry_owed(&b, q.sol_index).unwrap();
    let oc = entry_owed(&c, q.sol_index).unwrap();
    // same price for everyone: SOL received proportional to tokens sold
    assert!(oa.abs_diff(3 * ob) <= 3);
    assert!(oa + ob + oc <= 4 * SOL);
    assert!(4 * SOL - (oa + ob + oc) <= 3, "rounding dust ≤ 1 lamport per entry");
    // escrow never owes more than it holds
    assert!(ra + rb + rc <= q.queued_total);
    assert!(q.queued_total - (ra + rb + rc) <= 3);

    // window 2: everything left sells → epoch closes
    let rest = q.queued_total;
    let f2 = q.fill(rest, 30 * SOL).unwrap();
    assert!(f2.closed_epoch);
    assert_eq!(f2.epoch, 0);
    assert_eq!(q.epoch, 1);
    assert_eq!(q.queued_total, 0);
    assert_eq!(q.scale, SCALE_ONE);
    let oa2 = entry_owed(&a, f2.final_sol_index).unwrap();
    let ob2 = entry_owed(&b, f2.final_sol_index).unwrap();
    assert!(oa2 > oa && ob2 > ob);
    assert!(oa2.abs_diff(3 * ob2) <= 6);
    assert_eq!(entry_remaining(&a, 0).unwrap(), 0);
}

#[test]
fn queue_leave_mid_epoch_returns_remaining_and_owed() {
    let mut q = QueueAcc::default();
    let a = q.join(tok(10_000_000)).unwrap();
    let _b = q.join(tok(10_000_000)).unwrap();
    q.fill(tok(5_000_000), SOL).unwrap();
    let (rem, owed) = q.leave(&a).unwrap();
    assert!(rem.abs_diff(tok(7_500_000)) <= 1, "{rem}");
    assert!(owed.abs_diff(SOL / 2) <= 1, "{owed}");
    assert_eq!(q.queued_total, tok(20_000_000) - tok(5_000_000) - rem);
    // joining again after partial fills: shares are scaled, remaining is exact
    let c = q.join(tok(1_000_000)).unwrap();
    assert!(entry_remaining(&c, q.scale).unwrap().abs_diff(tok(1_000_000)) <= 1);
    assert_eq!(entry_owed(&c, q.sol_index).unwrap(), 0);
}

#[test]
fn queue_splitting_across_wallets_changes_nothing() {
    let mut one = QueueAcc::default();
    let whole = one.join(tok(90_000_000)).unwrap();
    let mut many = QueueAcc::default();
    let parts: Vec<_> = (0..9).map(|_| many.join(tok(10_000_000)).unwrap()).collect();
    // the aggregate swap is the same size, so the same SOL comes out
    one.fill(tok(9_000_000), 3 * SOL).unwrap();
    many.fill(tok(9_000_000), 3 * SOL).unwrap();
    let owed_whole = entry_owed(&whole, one.sol_index).unwrap();
    let owed_parts: u64 = parts.iter().map(|p| entry_owed(p, many.sol_index).unwrap()).sum();
    assert!(owed_whole.abs_diff(owed_parts) <= 9);
    let rem_whole = entry_remaining(&whole, one.scale).unwrap();
    let rem_parts: u64 = parts.iter().map(|p| entry_remaining(p, many.scale).unwrap()).sum();
    assert!(rem_whole.abs_diff(rem_parts) <= 9);
}

// ───────────────────────── scenario: dev dumps 30 % ─────────────────────────

/// Simulates the brake on the pool: a holder tries to sell 30 % of the supply
/// at once. Only the window allowance executes; the rest is queued and served
/// window by window; the price never prints more than 20 % under the window
/// reference. Market sells above the floor do lower the floor of the others (a
/// seller takes more than their floor share), so the floor is not monotone
/// here; what the test pins down is that the drain is slow, bounded, and that
/// once the dump is through, redeeming beats selling into the pool.
#[test]
fn dev_dump_30_percent_is_braked_and_floor_holds() {
    let mut c = Coin::new();
    c.fill_curve();
    let dump = tok(300_000_000);
    let mut remaining = dump;
    let mut windows = 0;
    let floor0 = floor_q64(c.pool().sol, c.circ()).unwrap();
    let mut worst_drop_bps = 0u128;
    while remaining > 0 {
        windows += 1;
        let r = c.pool();
        let ref_px = price_q64(r.sol, r.tok).unwrap();
        let allowed = brake_allowed(2_000, r.sol, r.tok, r.sol, r.tok).unwrap();
        let sold = allowed.min(remaining);
        assert!(sold > 0);
        // tokens in the queue are not circulating
        c.queue.queued_total = remaining;
        c.swap_sell(sold).unwrap();
        c.queue.queued_total = remaining - sold;
        remaining -= sold;
        let px = price_q64(c.pool().sol, c.pool().tok).unwrap();
        let drop = (ref_px - px) * BPS / ref_px;
        worst_drop_bps = worst_drop_bps.max(drop);
        assert!(drop <= 2_000, "window {windows}: drop {drop} bps");
        assert!(c.pool().sol > 0 && floor_q64(c.pool().sol, c.circ()).unwrap() > 0);
    }
    assert!(windows >= 8, "30 % of the supply cannot leave in fewer than 8 windows (got {windows})");
    assert!(worst_drop_bps >= 1_900, "the brake is binding, not idle");
    let floor1 = floor_q64(c.pool().sol, c.circ()).unwrap();
    assert!(floor1 * 2 > floor0, "a 30 % dump cannot halve the floor: {floor0} → {floor1}");
    // after the dump the pool price sits at or under the floor: redeeming beats selling.
    let x = tok(1_000_000);
    let by_redeem = redeem(&P, &c.pool(), 0, c.supply, x).unwrap().sol_out;
    let by_sell = pool_sell(&P, &c.pool(), x).unwrap().sol_net;
    assert!(by_redeem >= by_sell, "redeem {by_redeem} < sell {by_sell}");
}

// ───────────────────────── property tests ─────────────────────────

fn arb_pool() -> impl Strategy<Value = (PoolState, u64, u64)> {
    // (pool, queued, supply) consistent: supply ≥ tok + queued, with a circulation ≥ 1.
    (1u64..=5_000 * SOL, 1u64..=TOTAL_SUPPLY - 1, 0u64..=tok(100_000_000)).prop_flat_map(|(sol, t, q)| {
        let max_t = TOTAL_SUPPLY - 1 - q;
        let t = t.min(max_t).max(1);
        ((t + q + 1)..=TOTAL_SUPPLY).prop_map(move |supply| (PoolState { sol, tok: t }, q, supply))
    })
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(4_000))]

    /// I1 + I2: for any pool, any queue, any supply and any x ≤ C, redeeming x
    /// does not lower the floor of the others nor the pool price, and the
    /// holder receives floor(S·x/C) minus at most ceil(0.5 %).
    #[test]
    fn redeem_invariants((pool, queued, supply) in arb_pool(), xf in 1u64..=1_000_000) {
        let c = circulating(supply, pool.tok, queued).unwrap();
        let x = ((u128::from(c) * u128::from(xf) / 1_000_000) as u64).max(1);
        match redeem(&P, &pool, queued, supply, x) {
            Err(CoreError::DustOutput) => {
                // only legitimate when the share really rounds to nothing
                let gross = u128::from(pool.sol) * u128::from(x) / u128::from(c);
                prop_assert!(gross <= 1 || (x != c && gross - mul_div_ceil(gross, 50, BPS).unwrap() == 0));
            }
            Err(e) => prop_assert!(false, "unexpected {e:?}"),
            Ok(r) => {
                let c2 = circulating(r.supply_after, r.after.tok, queued).unwrap();
                prop_assert_eq!(c2, c - x);
                // I1: S'/C' ≥ S/C  ⇔  S'·C ≥ S·C'
                if c2 > 0 {
                    prop_assert!(u128::from(r.after.sol) * u128::from(c) >= u128::from(pool.sol) * u128::from(c2));
                }
                // I2: S'/T' ≥ S/T  ⇔  S'·T ≥ S·T'
                if r.after.tok > 0 {
                    prop_assert!(u128::from(r.after.sol) * u128::from(pool.tok) >= u128::from(pool.sol) * u128::from(r.after.tok));
                    // and it moved only by rounding plus the exit fee that stays in the pool:
                    // S'·T − S·T' = S·burn − net·T ≤ S·(Tx/C + 1) − (Sx/C − 1 − fee)·T = S + T + fee·T
                    let lhs = u128::from(r.after.sol) * u128::from(pool.tok) - u128::from(pool.sol) * u128::from(r.after.tok);
                    let bound = u128::from(pool.sol) + u128::from(pool.tok) * (1 + u128::from(r.fee_kept));
                    prop_assert!(lhs <= bound, "price moved more than rounding + fee allow");
                }
                // exact payout
                let gross = (u128::from(pool.sol) * u128::from(x) / u128::from(c)) as u64;
                prop_assert_eq!(r.sol_gross, if x == c { pool.sol } else { gross });
                prop_assert!(r.sol_out <= r.sol_gross);
                prop_assert!(r.sol_gross - r.sol_out <= fee_ceil(r.sol_gross, 50).unwrap());
                if x == c {
                    prop_assert_eq!(r.sol_out, pool.sol);
                    prop_assert_eq!(r.after, PoolState { sol: 0, tok: 0 });
                }
            }
        }
    }

    /// I3: any two queued orders are filled at the same percentage and the
    /// same price, whatever the sizes and the fill, within one base unit.
    #[test]
    fn queue_pro_rata(a in 1u64..=tok(500_000_000), b in 1u64..=tok(500_000_000), frac in 1u64..=1_000_000, sol_out in 0u64..=10_000 * SOL) {
        let mut q = QueueAcc::default();
        let pa = q.join(a).unwrap();
        let pb = q.join(b).unwrap();
        let total = a + b;
        let sold = ((u128::from(total) * u128::from(frac) / 1_000_000) as u64).max(1);
        let f = q.fill(sold, sol_out).unwrap();
        let (scale, idx) = if f.closed_epoch { (0, f.final_sol_index) } else { (q.scale, q.sol_index) };
        let ra = entry_remaining(&pa, scale).unwrap();
        let rb = entry_remaining(&pb, scale).unwrap();
        let oa = entry_owed(&pa, idx).unwrap();
        let ob = entry_owed(&pb, idx).unwrap();
        prop_assert!(ra <= a && rb <= b);
        // fill fraction: (a − ra)/a ≈ (b − rb)/b  ⇔  (a−ra)·b ≈ (b−rb)·a within a+b
        let fa = u128::from(a - ra) * u128::from(b);
        let fb = u128::from(b - rb) * u128::from(a);
        prop_assert!(fa.abs_diff(fb) <= u128::from(a) + u128::from(b) + 1, "fill not pro rata: {a} {b} {ra} {rb}");
        // same price: oa/(a−ra) ≈ ob/(b−rb)
        if a > ra && b > rb {
            let xa = u128::from(oa) * u128::from(b - rb);
            let xb = u128::from(ob) * u128::from(a - ra);
            prop_assert!(xa.abs_diff(xb) <= u128::from(a - ra) + u128::from(b - rb) + u128::from(a) + u128::from(b));
        }
        // the escrow and the vault never owe more than they received
        prop_assert!(oa + ob <= sol_out);
        prop_assert!(sol_out - (oa + ob) <= 2);
        prop_assert!(u128::from(ra) + u128::from(rb) <= u128::from(total - sold));
        prop_assert!(u128::from(total - sold) - (u128::from(ra) + u128::from(rb)) <= 2);
    }

    /// Curve: SOL is conserved to the lamport, k never decreases, the buyer is
    /// never charged more than offered, and a buy then sell never profits.
    #[test]
    fn curve_accounting(buys in proptest::collection::vec(1_000_000u64..=20 * SOL, 1..40)) {
        let mut c = Coin::new();
        let k0 = u128::from(P.virtual_sol) * u128::from(P.virtual_tok);
        let mut sol_in = 0u64;
        let mut tokens = 0u64;
        for s in buys {
            match c.buy(s) {
                Ok(q) => {
                    prop_assert!(q.sol_charged <= s);
                    prop_assert_eq!(q.sol_charged, q.sol_net + q.fee.total);
                    sol_in += q.sol_charged;
                    tokens += q.tokens_out;
                    let (vs, vt) = c.curve.reserves(&P).unwrap();
                    prop_assert!(u128::from(vs) * u128::from(vt) >= k0);
                    prop_assert!(c.curve.real_sol <= P.graduation_sol);
                    prop_assert!(c.curve.tokens_sold <= P.curve_supply);
                }
                Err(CoreError::CurveComplete) => break,
                Err(e) => prop_assert!(false, "{e:?}"),
            }
        }
        prop_assert_eq!(sol_in, c.curve.real_sol + c.floor_reserve + c.creator_fees + c.protocol_fees);
        // sell everything back
        let s = curve_sell(&P, &c.curve, tokens).unwrap();
        prop_assert!(s.sol_net < sol_in);
        prop_assert!(s.sol_gross <= c.curve.real_sol);
    }

    /// Pool: round trips never profit, k never decreases, fees add up.
    #[test]
    fn pool_accounting(ops in proptest::collection::vec((any::<bool>(), 1_000_000u64..=50 * SOL), 1..60)) {
        let mut c = Coin::new();
        c.fill_curve();
        let mut held = 0u64;
        let mut spent = 0u64;
        let mut got = 0u64;
        for (is_buy, amt) in ops {
            let k0 = u128::from(c.pool().sol) * u128::from(c.pool().tok);
            if is_buy {
                let q = c.swap_buy(amt).unwrap();
                prop_assert_eq!(q.fee.total, q.fee.pool + q.fee.creator + q.fee.protocol);
                held += q.tokens_out;
                spent += amt;
            } else if held > 0 {
                let t = (u128::from(held) * u128::from(amt % 1_000) / 1_000) as u64;
                if t == 0 { continue; }
                match c.swap_sell(t) {
                    Ok(q) => { held -= t; got += q.sol_net; }
                    Err(CoreError::DustOutput) => {}
                    Err(e) => prop_assert!(false, "{e:?}"),
                }
            }
            let k1 = u128::from(c.pool().sol) * u128::from(c.pool().tok);
            prop_assert!(k1 >= k0);
        }
        prop_assert!(got <= spent);
        prop_assert!(c.pool().tok + held + c.curve.tokens_sold - held <= TOTAL_SUPPLY);
    }

    /// Brake: selling the allowance never breaches the bound; selling one more
    /// unit than the allowance plus 0.01 % does.
    #[test]
    fn brake_bound_holds(sol in SOL..=100_000 * SOL, t in tok(1_000_000)..=TOTAL_SUPPLY, up in 0u64..=5_000, drop in 100u16..=9_000) {
        // reference at (sol, t); current price moved up by `up` bps since (buys never braked)
        let cur_sol = (u128::from(sol) * (BPS + u128::from(up)) / BPS) as u64;
        let allowed = brake_allowed(drop, sol, t, cur_sol, t).unwrap();
        let k = u128::from(cur_sol) * u128::from(t);
        let t2 = u128::from(t) + u128::from(allowed);
        // price after = k / t2²  must be ≥ ref · (1 − drop)  ⇔  k · BPS ≥ ref_sol/ref_tok · (BPS−drop) · t2²
        // cross-multiplied: k · BPS · t ≥ sol · (BPS − drop) · t2²   (all fit in u128 for these ranges? use checked)
        let lhs = k.checked_mul(BPS).and_then(|v| v.checked_mul(u128::from(t)));
        let rhs = u128::from(sol).checked_mul(BPS - u128::from(drop)).and_then(|v| v.checked_mul(t2)).and_then(|v| v.checked_mul(t2));
        if let (Some(l), Some(r)) = (lhs, rhs) {
            prop_assert!(l >= r, "allowance breaches the bound");
            let t3 = t2 + t2 / 10_000 + 1;
            let rhs3 = u128::from(sol).checked_mul(BPS - u128::from(drop)).and_then(|v| v.checked_mul(t3)).and_then(|v| v.checked_mul(t3));
            if let Some(r3) = rhs3 {
                prop_assert!(l < r3, "allowance is not tight");
            }
        }
    }
}

// ───────────────────────── vectors for the TypeScript port ─────────────────────────

/// Prints JSON test vectors consumed by `packages/sdk/test/parity.test.ts`.
/// Run: `cargo test -p floored-core --release vectors -- --ignored --nocapture`
#[test]
#[ignore]
fn vectors() {
    let mut out = String::from("[");
    let mut first = true;
    let mut push = |s: String| {
        if !first {
            out.push(',');
        }
        first = false;
        out.push_str(&s);
    };
    let mut c = Coin::new();
    for sol in [SOL / 100, SOL, 3 * SOL, 10 * SOL, 50 * SOL, 40 * SOL] {
        let before = c.curve;
        if let Ok(q) = c.buy(sol) {
            push(format!(
                "{{\"op\":\"curve_buy\",\"real_sol\":{},\"tokens_sold\":{},\"sol_max\":{},\"sol_net\":{},\"fee\":{},\"creator\":{},\"protocol\":{},\"pool\":{},\"tokens_out\":{},\"completes\":{}}}",
                before.real_sol, before.tokens_sold, sol, q.sol_net, q.fee.total, q.fee.creator, q.fee.protocol, q.fee.pool, q.tokens_out, q.completes
            ));
        }
    }
    let before = c.curve;
    let q = c.sell(tok(1_234_567)).unwrap();
    push(format!(
        "{{\"op\":\"curve_sell\",\"real_sol\":{},\"tokens_sold\":{},\"tokens_in\":{},\"sol_gross\":{},\"fee\":{},\"sol_net\":{}}}",
        before.real_sol, before.tokens_sold, tok(1_234_567), q.sol_gross, q.fee.total, q.sol_net
    ));
    c.fill_curve();
    let pool = c.pool();
    push(format!(
        "{{\"op\":\"graduation\",\"real_sol\":{},\"tokens_sold\":{},\"floor_reserve\":{},\"pool_sol\":{},\"pool_tok\":{}}}",
        c.curve.real_sol, c.curve.tokens_sold, c.floor_reserve, pool.sol, pool.tok
    ));
    let before = c.pool();
    let q = c.swap_buy(2 * SOL + 1).unwrap();
    push(format!(
        "{{\"op\":\"pool_buy\",\"sol\":{},\"tok\":{},\"sol_in\":{},\"tokens_out\":{},\"fee\":{},\"pool_fee\":{},\"after_sol\":{},\"after_tok\":{}}}",
        before.sol, before.tok, 2 * SOL + 1, q.tokens_out, q.fee.total, q.fee.pool, q.after.sol, q.after.tok
    ));
    let before = c.pool();
    let q = c.swap_sell(tok(777_777)).unwrap();
    push(format!(
        "{{\"op\":\"pool_sell\",\"sol\":{},\"tok\":{},\"tokens_in\":{},\"sol_net\":{},\"fee\":{},\"after_sol\":{},\"after_tok\":{}}}",
        before.sol, before.tok, tok(777_777), q.sol_net, q.fee.total, q.after.sol, q.after.tok
    ));
    let before = c.pool();
    let supply = c.supply;
    let q = c.redeem(tok(12_345_678)).unwrap();
    push(format!(
        "{{\"op\":\"redeem\",\"sol\":{},\"tok\":{},\"queued\":0,\"supply\":{},\"x\":{},\"circulating\":{},\"sol_out\":{},\"fee_kept\":{},\"pool_burn\":{},\"after_sol\":{},\"after_tok\":{}}}",
        before.sol, before.tok, supply, tok(12_345_678), q.circulating, q.sol_out, q.fee_kept, q.pool_burn, q.after.sol, q.after.tok
    ));
    let p = c.pool();
    push(format!(
        "{{\"op\":\"brake_allowed\",\"ref_sol\":{},\"ref_tok\":{},\"sol\":{},\"tok\":{},\"allowed\":{}}}",
        p.sol, p.tok, p.sol, p.tok, brake_allowed(2_000, p.sol, p.tok, p.sol, p.tok).unwrap()
    ));
    let mut q = QueueAcc::default();
    let a = q.join(tok(300_000_000)).unwrap();
    let b = q.join(tok(100_000_000)).unwrap();
    q.fill(tok(40_000_000), 4 * SOL).unwrap();
    push(format!(
        "{{\"op\":\"queue\",\"a\":{},\"b\":{},\"sold\":{},\"sol_out\":{},\"scale\":\"{}\",\"sol_index\":\"{}\",\"a_remaining\":{},\"b_remaining\":{},\"a_owed\":{},\"b_owed\":{}}}",
        tok(300_000_000), tok(100_000_000), tok(40_000_000), 4 * SOL, q.scale, q.sol_index,
        entry_remaining(&a, q.scale).unwrap(), entry_remaining(&b, q.scale).unwrap(),
        entry_owed(&a, q.sol_index).unwrap(), entry_owed(&b, q.sol_index).unwrap()
    ));
    out.push(']');
    println!("VECTORS_BEGIN{out}VECTORS_END");
}
