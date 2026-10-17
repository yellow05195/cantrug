//! On-chain scenarios: the built floored.so in LiteSVM, every operation
//! replayed lamport-exact on floored-core (`assert_mirror` after each op).
//!
//! Covered:
//!   creation      supply, revoked mint authority, no freeze authority, metadata, frozen params
//!   curve         buy/sell mirror the core, fees land in the right vaults, last buy capped at 85 SOL
//!   graduation    pool = real SOL + floor reserve, every unsold token, no burn, crank reward,
//!                 refused before completion, floor at graduation = average price paid
//!   the floor     redeem pays S·x/C − 0.5 %, floor of the others never falls, price unchanged,
//!                 last holder empties the pool, refused on the curve
//!   the brake     dev dumps 30 %: part executes, rest queued; windows fill pro rata at one
//!                 price; cancel / claim / queue_to_redeem; splitting wallets changes nothing;
//!                 buys never braked; redeem never braked
//!   arbitrage     price under the floor → buy + redeem is profitable and lifts the price
//!   dead coin     24 h of silence: redeem still works at the same floor
//!   no admin      the IDL has no instruction that moves vault SOL to the authority;
//!                 update_config leaves existing coins untouched

use floored_tests::*;

fn idl_names(v: &serde_json::Value, key: &str) -> Vec<String> {
    v[key].as_array().unwrap().iter().map(|i| i["name"].as_str().unwrap().to_string()).collect()
}

// ───────────────────────────── creation ─────────────────────────────

#[test]
fn create_coin_mints_once_and_revokes_everything() {
    let c = Chain::new();
    let m = c.mint_state();
    assert_eq!(m.supply, core::TOTAL_SUPPLY);
    assert_eq!(m.decimals, 6);
    assert!(m.mint_authority.is_none(), "mint authority revoked");
    assert!(m.freeze_authority.is_none(), "no freeze authority");
    assert_eq!(c.token_balance(&c.keys.curve_token_vault), core::TOTAL_SUPPLY);
    assert!(c.account(&c.keys.metadata).map(|a| a.data.len() > 0).unwrap_or(false), "metadata created");
    let coin = c.coin();
    assert_eq!(coin.params.to_core(), P, "params frozen from config");
    assert_eq!(coin.phase, 0);
    assert_eq!(coin.brake.ref_sol, P.virtual_sol);
    assert_eq!(coin.brake.ref_tok, P.virtual_tok);
    for v in [c.keys.curve_vault, c.keys.floor_reserve, c.keys.pool_sol_vault, c.keys.fee_vault, c.keys.queue_sol_vault] {
        let a = c.account(&v).unwrap();
        assert_eq!(a.owner, PROGRAM_ID, "vault owned by the program");
        assert_eq!(a.data.len(), 0);
        assert_eq!(a.lamports, c.vault_rent);
    }
    assert_eq!(c.config().coins_created, 1);
    assert_eq!(c.lamports(&c.recipient.pubkey()), SOL + CREATE_FEE, "creation fee paid to the protocol recipient");
    c.assert_mirror();
}

// ───────────────────────────── curve ─────────────────────────────

#[test]
fn curve_buys_and_sells_mirror_core_and_route_fees() {
    let mut c = Chain::new();
    let a = c.wallet(50);
    let b = c.wallet(50);
    let q = c.buy(&a, SOL);
    assert_eq!(c.bag(&a.pubkey()), q.tokens_out);
    assert_eq!(c.lamports(&c.keys.floor_reserve), c.vault_rent + q.fee.pool);
    assert_eq!(c.lamports(&c.keys.fee_vault), c.vault_rent + q.fee.creator + q.fee.protocol);
    c.buy(&b, 3 * SOL);
    // partial sell, no brake involved (small)
    let (exec, sol_net, queued) = c.sell(&a, q.tokens_out / 4, true);
    assert_eq!(exec, q.tokens_out / 4);
    assert_eq!(queued, 0);
    assert!(sol_net > 0);
    assert_eq!(c.bag(&a.pubkey()), q.tokens_out - q.tokens_out / 4);
    // creator and protocol can claim
    let cf = c.claim_creator_fees();
    assert!(cf > 0);
    let pf = c.claim_protocol_fees(&b);
    assert!(pf > 0);
    // redeem is refused on the curve
    assert_err(c.try_redeem(&a, 1_000), "WrongPhase");
    // graduate is refused before completion
    assert_err(c.try_graduate(&a), "CurveNotComplete");
}

#[test]
fn last_buy_is_capped_and_curve_closes_at_graduation_sol() {
    let mut c = Chain::new();
    let whale = c.wallet(500);
    let mut paid = 0u64;
    while !c.model.curve.is_complete(&P) {
        let before = c.lamports(&whale.pubkey());
        c.buy(&whale, 40 * SOL);
        paid += before - c.lamports(&whale.pubkey()) - SIG_FEE;
    }
    let coin = c.coin();
    assert_eq!(coin.real_sol, P.graduation_sol, "exactly 85 SOL real");
    assert!(coin.tokens_sold <= P.curve_supply);
    assert!(paid < 3 * 40 * SOL, "the last buy was only charged what the curve could take");
    assert_err(c.try_buy(&whale, SOL), "CurveComplete");
}

// ───────────────────────────── graduation ─────────────────────────────

#[test]
fn graduation_opens_the_pool_with_everything_and_burns_nothing() {
    let mut c = Chain::new();
    let buyer = c.wallet(300);
    c.fill_curve(&buyer);
    let before = c.coin();
    let cranker = c.wallet(1);
    c.graduate(&cranker);
    let coin = c.coin();
    assert_eq!(coin.phase, 1);
    assert_eq!(coin.pool_sol, before.real_sol + before.floor_reserve);
    assert_eq!(coin.pool_tok, core::TOTAL_SUPPLY - before.tokens_sold);
    assert_eq!(c.token_balance(&c.keys.pool_token_vault) + c.bag(&buyer.pubkey()), core::TOTAL_SUPPLY, "nothing burned");
    assert_eq!(c.mint_state().supply, core::TOTAL_SUPPLY);
    assert_eq!(c.lamports(&c.keys.curve_vault), c.vault_rent);
    assert_eq!(c.lamports(&c.keys.floor_reserve), c.vault_rent);
    assert_eq!(c.config().coins_graduated, 1);
    // floor at graduation = average price paid (within the 0.3 % floor reserve)
    let floor = c.floor_q64();
    let avg = core::floor_q64(before.real_sol, before.tokens_sold).unwrap();
    assert!(floor >= avg && floor - avg <= avg / 200, "floor {floor} vs avg {avg}");
    // and the pool price is continuous with the curve
    let (vs, vt) = before.curve().reserves(&P).unwrap();
    let curve_px = core::price_q64(vs, vt).unwrap();
    let pool_px = c.price_q64();
    assert!(pool_px >= curve_px && pool_px - curve_px <= curve_px / 200);
    assert_err(c.try_graduate(&cranker), "WrongPhase");
    assert_err(c.try_buy(&buyer, SOL), "WrongPhase");
}

// ───────────────────────────── the floor ─────────────────────────────

#[test]
fn redeem_pays_exact_share_and_never_lowers_the_floor_or_the_price() {
    let buyer = Keypair::new();
    let mut c = Chain::graduated(&buyer);
    let other = c.wallet(50);
    c.swap_buy(&other, 5 * SOL);
    let floor0 = c.floor_q64();
    let price0 = c.price_q64();
    let coin = c.coin();
    let circ = core::circulating(c.mint_state().supply, coin.pool_tok, 0).unwrap();
    let x = tok(50_000_000);
    let expected = c.redeem_quote(x).unwrap();
    assert_eq!(expected.sol_gross, ((coin.pool_sol as u128) * (x as u128) / (circ as u128)) as u64);
    let q = c.redeem(&buyer, x);
    assert_eq!(q, expected);
    assert_eq!(q.fee_kept, core::fee_ceil(q.sol_gross, 50).unwrap());
    assert!(c.floor_q64() >= floor0, "floor of the others did not fall");
    assert!(c.price_q64() >= price0, "pool price did not fall");
    assert!(c.price_q64() - price0 <= price0 / 1_000, "pool price moved only by the exit fee kept in the pool (< 0.1 %)");
    assert_eq!(c.mint_state().supply, core::TOTAL_SUPPLY - x - q.pool_burn);
    assert_eq!(c.config().total_redeemed_sol, q.sol_out);
    assert_eq!(c.coin().redeem_count, 1);
    // dust and zero
    assert_err(c.try_redeem(&buyer, 0), "ZeroAmount");
    assert_err(c.try_redeem(&buyer, 1), "DustOutput");
}

#[test]
fn everyone_redeems_last_holder_takes_every_lamport() {
    let buyer = Keypair::new();
    let mut c = Chain::graduated(&buyer);
    let b = c.wallet(50);
    let d = c.wallet(50);
    c.swap_buy(&b, 4 * SOL);
    c.swap_buy(&d, 1 * SOL);
    let pool_start = c.coin().pool_sol;
    let mut paid = 0u64;
    let mut floor_prev = c.floor_q64();
    for (who, n) in [(&buyer, 3u64), (&b, 1), (&d, 1)] {
        for _ in 0..n {
            let bag = c.bag(&who.pubkey());
            let x = if n == 1 { bag } else { bag / 2 };
            let q = c.redeem(who, x.max(1));
            paid += q.sol_out;
            let circ = c.model.circulating();
            if circ > 0 {
                let f = c.floor_q64();
                assert!(f >= floor_prev, "floor fell {floor_prev} → {f}");
                floor_prev = f;
            }
        }
    }
    // the rest of buyer's bag is the last holding
    let last = c.bag(&buyer.pubkey());
    let q = c.redeem(&buyer, last);
    paid += q.sol_out;
    assert_eq!(q.fee_kept, 0, "no exit fee for the last holder");
    let coin = c.coin();
    assert_eq!(coin.pool_sol, 0);
    assert_eq!(coin.pool_tok, 0);
    assert_eq!(c.mint_state().supply, 0);
    assert_eq!(paid, pool_start, "every lamport of the pool went to holders");
    assert_eq!(c.lamports(&c.keys.pool_sol_vault), c.vault_rent);
    assert_err(c.try_redeem(&buyer, 1), "NothingInCirculation");
}

// ───────────────────────────── the brake ─────────────────────────────

#[test]
fn dev_dump_30_percent_is_braked_and_served_pro_rata() {
    let dev = Keypair::new();
    let mut c = Chain::graduated(&dev);
    let small = c.wallet(50);
    c.swap_buy(&small, 2 * SOL);
    let price0 = c.price_q64();
    let dump = tok(300_000_000);
    assert!(c.bag(&dev.pubkey()) > dump);

    // 1. the dump: only ~11.8 % of the pool tokens execute, the rest is queued
    let (exec, _, queued) = c.sell(&dev, dump, true);
    assert!(exec > 0 && queued > 0);
    assert_eq!(exec + queued, dump);
    let coin = c.coin();
    assert!(exec < coin.pool_tok / 7, "executed part {exec} is bounded by the window allowance");
    assert_eq!(coin.brake.queued_total, queued);
    assert_eq!(coin.brake.engagements, 1);
    let drop = (price0 - c.price_q64()) * 10_000 / price0;
    assert!((1_990..=2_000).contains(&drop), "price fell {drop} bps: exactly to the brake");

    // 2. a second seller in the same window is fully queued (budget exhausted)
    // (a few tokens may still fit: the 0.2 % fee the dump left in the pool nudged the price up)
    let (exec2, _, queued2) = c.sell(&small, tok(1_000_000), true);
    assert!(exec2 < tok(50_000), "budget exhausted, only the fee nudge executes (< 5 % of the order): {exec2}");
    assert_eq!(exec2 + queued2, tok(1_000_000));

    // 3. opting out of the queue: only what fits executes, the rest stays in the wallet;
    //    a price limit above the market is refused as slippage
    let bag_before = c.bag(&small.pubkey());
    let (e3, _, q3) = c.sell(&small, tok(1_000_000), false);
    assert_eq!(q3, 0);
    assert_eq!(c.bag(&small.pubkey()), bag_before - e3);
    assert_err(c.try_sell(&small, tok(1_000_000), u64::MAX / 4, true), "SlippageExceeded");

    // 4. buys are never braked, redeem is never braked
    c.swap_buy(&small, SOL);
    let holder = c.wallet(10);
    c.swap_buy(&holder, SOL);
    c.redeem(&holder, c.bag(&holder.pubkey()) / 2);

    // 5. next window: the crank fills both queued orders at the same percentage and price
    c.next_window();
    let cranker = c.wallet(1);
    let before_dev = c.model.remaining(&c.entry_pos(&dev.pubkey()).unwrap());
    let before_small = c.model.remaining(&c.entry_pos(&small.pubkey()).unwrap());
    let (sold, sol_out) = c.process_queue(&cranker);
    assert!(sold > 0 && sol_out > 0);
    let pd = c.entry_pos(&dev.pubkey()).unwrap();
    let ps = c.entry_pos(&small.pubkey()).unwrap();
    let filled_dev = before_dev - c.model.remaining(&pd);
    let filled_small = before_small - c.model.remaining(&ps);
    // same fill fraction (cross-multiplied, ±1 unit per side)
    let lhs = filled_dev as u128 * before_small as u128;
    let rhs = filled_small as u128 * before_dev as u128;
    assert!(lhs.abs_diff(rhs) <= (before_dev + before_small) as u128, "not pro rata");
    let od = c.model.owed(&pd);
    let os = c.model.owed(&ps);
    assert!((od as u128 * filled_small as u128).abs_diff(os as u128 * filled_dev as u128) <= (filled_dev + filled_small) as u128 * 2, "not one price");
    // the crank cannot run twice in the same window
    assert_err(c.try_process_queue(&cranker), "WindowNotElapsed");

    // 6. the small seller claims what it earned and stays queued
    let claimed = c.claim_queue(&small);
    assert_eq!(claimed, os);
    assert_eq!(c.model.owed(&c.entry_pos(&small.pubkey()).unwrap()), 0);

    // 7. the dev switches the rest to the floor: instant, at the floor. Queued tokens are
    //    outside C, so the honest "before" floor counts them back in before comparing.
    let rem_before = c.model.remaining(&c.entry_pos(&dev.pubkey()).unwrap());
    let cb = c.coin();
    let circ_b = core::circulating(c.mint_state().supply, cb.pool_tok, cb.brake.queued_total).unwrap();
    let floor_before = core::floor_q64(cb.pool_sol, circ_b + rem_before).unwrap();
    let (remaining, paid) = c.queue_to_redeem(&dev);
    assert!(remaining > 0 && paid > 0);
    assert!(c.floor_q64() >= floor_before, "floor fell through queue_to_redeem");
    let rem_small = c.model.remaining(&c.entry_pos(&small.pubkey()).unwrap());
    let qt = c.coin().brake.queued_total;
    assert!(qt >= rem_small && qt - rem_small <= 2, "aggregate {qt} vs small's remaining {rem_small} (rounding dust only)");

    // 8. windows keep serving the small seller until the queue empties and the epoch closes
    let mut windows = 0;
    while c.coin().brake.queued_total > 0 {
        c.next_window();
        c.process_queue(&cranker);
        windows += 1;
        assert!(windows < 10);
    }
    let coin = c.coin();
    assert_eq!(coin.brake.epoch, 1, "epoch closed and rolled");
    assert_eq!(coin.brake.scale, core::SCALE_ONE);
    let rec = c.epoch_record(0).expect("record of epoch 0");
    assert!(rec.closed);
    // the small seller's entry is from the closed epoch: cancel pays the final SOL and closes it
    let (rem, owed) = c.cancel_queue(&small);
    assert_eq!(rem, 0);
    assert!(owed > 0);
    // an empty queue has nothing to process
    c.next_window();
    assert_err(c.try_process_queue(&cranker), "QueueEmpty");
}

#[test]
fn queue_is_served_before_fresh_sellers_and_re_queueing_merges() {
    let dev = Keypair::new();
    let mut c = Chain::graduated(&dev);
    let other = c.wallet(100);
    c.swap_buy(&other, 10 * SOL);
    c.sell(&dev, tok(200_000_000), true);
    assert!(c.coin().brake.queued_total > 0);
    c.next_window();
    // a fresh sell in the new window first triggers the queue fill, then finds no budget left
    let q_before = c.coin().brake.queued_total;
    let (exec, _, queued) = c.sell(&other, tok(5_000_000), true);
    assert!(c.coin().brake.queued_total < q_before + queued, "the queue was filled first");
    assert!(exec < tok(250_000), "next to nothing left for the fresh seller in this window (< 5 % of the order): {exec}");
    assert_eq!(exec + queued, tok(5_000_000));
    // the dev queues more: positions merge
    let pos1 = c.entry_pos(&dev.pubkey()).unwrap();
    c.sell(&dev, tok(10_000_000), true);
    let pos2 = c.entry_pos(&dev.pubkey()).unwrap();
    assert!(pos2.shares > pos1.shares);
    assert_eq!(pk(&c.entry(&dev.pubkey()).unwrap().owner), dev.pubkey());
}

#[test]
fn splitting_a_dump_across_wallets_does_not_help() {
    let dev = Keypair::new();
    let mut c = Chain::graduated(&dev);
    // nine sybils receive 10M each
    let sybils: Vec<Keypair> = (0..9).map(|_| c.wallet(2)).collect();
    for s in &sybils {
        // move tokens by selling from dev? simpler: sybils buy small bags from the pool
        c.swap_buy(s, SOL);
    }
    let _ = c.sell(&dev, tok(250_000_000), true);
    let q0 = c.coin().brake.queued_total;
    for s in &sybils {
        let bag = c.bag(&s.pubkey());
        c.sell(s, bag, true);
    }
    assert!(c.coin().brake.queued_total > q0);
    c.next_window();
    let cranker = c.wallet(1);
    c.process_queue(&cranker);
    // every entry got the same fill percentage
    let pd = c.entry_pos(&dev.pubkey()).unwrap();
    let dev_entry = c.entry(&dev.pubkey()).unwrap();
    let dev_frac = (dev_entry.amount_queued - c.model.remaining(&pd)) as u128 * 1_000_000 / dev_entry.amount_queued as u128;
    for s in &sybils {
        let e = c.entry(&s.pubkey()).unwrap();
        let p = c.entry_pos(&s.pubkey()).unwrap();
        let frac = (e.amount_queued - c.model.remaining(&p)) as u128 * 1_000_000 / e.amount_queued as u128;
        assert!(frac.abs_diff(dev_frac) <= 2, "sybil fill {frac} vs dev {dev_frac}");
    }
}

#[test]
fn brake_works_on_the_curve_too() {
    let mut c = Chain::new();
    let whale = c.wallet(200);
    let other = c.wallet(20);
    c.buy(&whale, 30 * SOL);
    c.buy(&other, 5 * SOL);
    let bag = c.bag(&whale.pubkey());
    let price0 = c.price_q64();
    let (exec, _, queued) = c.sell(&whale, bag, true);
    assert!(exec > 0 && queued > 0, "curve sell braked: {exec} executed, {queued} queued");
    let drop = (price0 - c.price_q64()) * 10_000 / price0;
    assert!((1_990..=2_000).contains(&drop), "{drop} bps");
    // the queue carries across graduation and keeps being served by the pool
    let buyer = c.wallet(300);
    c.fill_curve(&buyer);
    let cr = c.creator.insecure_clone();
    c.graduate(&cr);
    assert!(c.coin().brake.queued_total > 0);
    c.next_window();
    let (sold, _) = c.process_queue(&other);
    assert!(sold > 0);
    // the whale can leave the queue for the floor
    let (rem, paid) = c.queue_to_redeem(&whale);
    assert!(rem > 0 && paid > 0);
}

// ───────────────────────────── arbitrage ─────────────────────────────

#[test]
fn price_under_the_floor_is_an_arbitrage_that_lifts_it() {
    let dev = Keypair::new();
    let mut c = Chain::graduated(&dev);
    // push the price under the floor over several windows (the brake only slows it down)
    let cranker = c.wallet(1);
    c.sell(&dev, tok(500_000_000), true);
    for _ in 0..12 {
        c.next_window();
        if c.coin().brake.queued_total == 0 {
            break;
        }
        c.process_queue(&cranker);
    }
    let px = c.price_q64();
    let fl = c.floor_q64();
    assert!(px < fl, "price {px} under floor {fl}");
    // a bot buys from the pool and redeems at the floor
    let bot = c.wallet(20);
    let spend = SOL;
    let b = c.swap_buy(&bot, spend);
    let r = c.redeem(&bot, b.tokens_out);
    assert!(r.sol_out > spend, "{} in → {} out", spend, r.sol_out);
    assert!(c.price_q64() > px, "the arbitrage lifted the price");
}

// ───────────────────────────── dead coin ─────────────────────────────

#[test]
fn dead_coin_24h_later_floor_is_intact() {
    let buyer = Keypair::new();
    let mut c = Chain::graduated(&buyer);
    let holder = c.wallet(20);
    c.swap_buy(&holder, 3 * SOL);
    let floor = c.floor_q64();
    let coin = c.coin();
    c.warp(216_000); // ≈ 24 h at 400 ms
    assert_eq!(c.coin().pool_sol, coin.pool_sol, "nothing moved");
    assert_eq!(c.floor_q64(), floor);
    let bag = c.bag(&holder.pubkey());
    let quote = c.redeem_quote(bag).unwrap();
    let q = c.redeem(&holder, bag);
    assert_eq!(q.sol_out, quote.sol_out);
    assert!(q.sol_out > 0);
    // the window state rolls lazily and harmlessly on the next sell
    let (exec, _, _) = c.sell(&buyer, tok(1_000_000), true);
    assert!(exec > 0);
}

// ───────────────────────────── no admin over the vaults ─────────────────────────────

#[test]
fn no_instruction_can_hand_vault_sol_to_the_authority() {
    let v = idl();
    let names = idl_names(&v, "instructions");
    for forbidden in ["withdraw", "pause", "freeze", "emergency", "sweep", "rescue", "set_fee", "migrate"] {
        assert!(!names.iter().any(|n| n.contains(forbidden)), "instruction {forbidden} must not exist: {names:?}");
    }
    // update_config touches only the config account
    let upd = v["instructions"].as_array().unwrap().iter().find(|i| i["name"] == "update_config").unwrap();
    let accts: Vec<&str> = upd["accounts"].as_array().unwrap().iter().map(|a| a["name"].as_str().unwrap()).collect();
    assert_eq!(accts, vec!["authority", "config"]);
    // and on-chain: changing defaults does not change an existing coin
    let mut c = Chain::new();
    let a = c.authority.insecure_clone();
    let mut p = P;
    p.brake_drop_bps = 500;
    p.redeem_fee_bps = 0;
    c.send(&[ix_update_config(a.pubkey(), Some(&p), None, None, None, None)], &[&a]).unwrap();
    assert_eq!(c.coin().params.to_core(), P);
    assert_eq!(c.config().params.to_core(), p);
    // a stranger cannot update the config
    let s = c.wallet(1);
    assert!(c.send(&[ix_update_config(s.pubkey(), None, Some(0), None, None, None)], &[&s]).is_err());
}

#[test]
fn idl_lists_every_promised_instruction_and_event() {
    let v = idl();
    let names = idl_names(&v, "instructions");
    for n in ["create_coin", "buy", "sell", "graduate", "swap_buy", "swap_sell", "redeem", "process_queue", "cancel_queue", "queue_to_redeem", "claim_queue", "claim_creator_fees", "claim_protocol_fees"] {
        assert!(names.contains(&n.to_string()), "missing {n}");
    }
    let events = idl_names(&v, "events");
    for e in ["BrakeEngaged", "BrakeReleased", "Trade", "Redeemed", "Graduated", "CoinCreated", "QueueProcessed"] {
        assert!(events.iter().any(|n| n == e || n.ends_with(&format!("::{e}"))), "missing event {e}");
    }
}

// ───────────────────────────── regressions found by the fuzzer ─────────────────────────────

/// Found by `tests/fuzz.rs`: positions that leave the queue floor their remainder, so a
/// few base units can stay queued. A window fill of that dust paid nothing and failed
/// with DustOutput, which made every later sell of the coin fail at the window roll.
/// Now the dust is swept into the venue for 0 SOL and the epoch closes.
#[test]
fn dust_left_in_the_queue_does_not_block_sells() {
    let dev = Keypair::new();
    let mut c = Chain::graduated(&dev);
    let other = c.wallet(50);
    c.swap_buy(&other, 5 * SOL);
    // two sellers queue, one window is served, then both leave: only rounding dust stays
    c.sell(&dev, tok(300_000_000), true);
    c.sell(&other, c.bag(&other.pubkey()), true);
    c.next_window();
    let cranker = c.wallet(1);
    c.process_queue(&cranker);
    c.cancel_queue(&dev);
    c.cancel_queue(&other);
    let dust = c.coin().brake.queued_total;
    assert!(dust > 0 && dust < 10, "rounding dust in the queue: {dust}");
    // next window: a plain sell must go through (the fill sweeps the dust) and the epoch closes
    c.next_window();
    let (exec, sol, queued) = c.sell(&other, tok(1_000), false);
    assert!(exec > 0 && sol > 0 && queued == 0);
    let coin = c.coin();
    assert_eq!(coin.brake.queued_total, 0, "dust swept");
    assert_eq!(coin.brake.epoch, 1, "epoch closed by the sweep");
    assert!(c.epoch_record(0).map(|r| r.closed).unwrap_or(false));
}

/// Found by `tests/fuzz.rs`: re-queueing with a position from an epoch older than the
/// current one failed with an account-owner error instead of `StaleQueueEntry`.
#[test]
fn requeue_with_a_stale_position_is_refused_cleanly() {
    let dev = Keypair::new();
    let mut c = Chain::graduated(&dev);
    let other = c.wallet(50);
    c.swap_buy(&other, 5 * SOL);
    // epoch 0: dev queues, the queue is fully served → epoch 1
    c.sell(&dev, tok(60_000_000), true);
    let cranker = c.wallet(1);
    let mut guard = 0;
    while c.coin().brake.queued_total > 0 {
        c.next_window();
        c.process_queue(&cranker);
        guard += 1;
        assert!(guard < 20);
    }
    assert_eq!(c.coin().brake.epoch, 1);
    // epoch 1: another seller opens a queue and gets served → epoch 2, while dev's entry is still from epoch 0
    c.next_window();
    c.swap_buy(&other, 20 * SOL);
    let (_, _, queued) = c.sell(&other, c.bag(&other.pubkey()), true);
    assert!(queued > 0, "the second seller must be braked to open epoch 1's queue");
    guard = 0;
    while c.coin().brake.queued_total > 0 {
        c.next_window();
        c.process_queue(&cranker);
        guard += 1;
        assert!(guard < 20);
    }
    assert_eq!(c.coin().brake.epoch, 2);
    assert_eq!(c.entry(&dev.pubkey()).unwrap().epoch, 0);
    // dev tries to queue again with the epoch-0 entry: clean error, nothing moved
    let bag = c.bag(&dev.pubkey());
    assert_err(c.try_sell(&dev, bag, 0, true), "StaleQueueEntry");
    // settling the old position first makes the sell possible
    let owed = c.claim_queue(&dev);
    assert!(owed > 0);
    let (exec, _, queued) = c.sell(&dev, bag, true);
    assert!(exec > 0 && queued > 0);
}
