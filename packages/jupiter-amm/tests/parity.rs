//! Quote-versus-execution parity, the check Jupiter's test kit performs:
//! snapshot the market account, quote through the `Amm` trait, execute the
//! program's native instruction in LiteSVM with the account metas and data the
//! crate produces, and compare the on-chain deltas with the quote.
//!
//! Needs `programs/floored/target/deploy/floored.so` (`pnpm build:program`).

use floored_jupiter_amm::{FlooredAmm, WSOL};
use floored_tests::{self as h, Chain, Keypair, Signer, SOL};
use jupiter_amm_interface::{Amm, AmmContext, KeyedAccount, QuoteParams, SwapMode, SwapParams};
use solana_address::Address;
use solana_pubkey::Pubkey;
use std::collections::HashMap;
use std::sync::atomic::Ordering;

fn to_pk(a: &Address) -> Pubkey {
    Pubkey::new_from_array(a.to_bytes())
}
fn to_addr(p: &Pubkey) -> Address {
    Address::new_from_array(p.to_bytes())
}

/// The market as Jupiter would hand it to `from_keyed_account`.
fn keyed_account(c: &Chain) -> KeyedAccount {
    let acc = c.account(&c.keys.coin).expect("coin account");
    KeyedAccount {
        key: to_pk(&c.keys.coin),
        account: solana_account::Account {
            lamports: acc.lamports,
            data: acc.data.clone(),
            owner: to_pk(&acc.owner),
            executable: acc.executable,
            rent_epoch: acc.rent_epoch,
        },
        params: None,
    }
}

fn amm_for(c: &Chain) -> FlooredAmm {
    let ctx = AmmContext::default();
    ctx.clock_ref.slot.store(c.slot(), Ordering::Relaxed);
    FlooredAmm::from_keyed_account(&keyed_account(c), &ctx).expect("market")
}

/// Refresh through `update`, the way the router does between quotes.
fn refresh(amm: &mut FlooredAmm, c: &Chain) {
    let ka = keyed_account(c);
    let mut map = HashMap::with_hasher(ahash_state());
    map.insert(ka.key, ka.account);
    amm.update(&map).unwrap();
    amm.slot = c.slot();
}

fn ahash_state() -> ahash::RandomState {
    ahash::RandomState::new()
}

fn swap_params<'a>(_amm: &FlooredAmm, user: &Address, source: Pubkey, dest: Pubkey, amount: u64, jup: &'a Pubkey) -> SwapParams<'static, 'a> {
    SwapParams {
        swap_mode: SwapMode::ExactIn,
        in_amount: amount,
        out_amount: 0,
        source_mint: source,
        destination_mint: dest,
        source_token_account: Pubkey::default(),
        destination_token_account: Pubkey::default(),
        token_transfer_authority: to_pk(user),
        user: to_pk(user),
        payer: to_pk(user),
        quote_mint_to_referrer: None,
        jupiter_program_id: jup,
        missing_dynamic_accounts_as_default: false,
    }
}

/// Execute the native instruction with the crate's metas and data.
fn execute(c: &mut Chain, user: &Keypair, metas: Vec<solana_instruction::AccountMeta>, data: Vec<u8>) -> Result<u64, String> {
    let ix = h::Instruction {
        program_id: h::PROGRAM_ID,
        accounts: metas
            .into_iter()
            .map(|m| h::AccountMeta { pubkey: to_addr(&m.pubkey), is_signer: m.is_signer, is_writable: m.is_writable })
            .collect(),
        data,
    };
    match c.send_big(&[ix], &[user]) {
        Ok(meta) => Ok(meta.compute_units_consumed),
        Err(e) => Err(e.meta.logs.join("\n")),
    }
}

#[test]
fn buy_quote_matches_execution() {
    let buyer = Keypair::new();
    let mut c = Chain::graduated(&buyer);
    let user = c.wallet(50);
    let mut amm = amm_for(&c);
    assert_eq!(amm.label(), "FLOORED");
    assert_eq!(amm.get_reserve_mints(), vec![WSOL, to_pk(&c.keys.mint)]);

    let jup = Pubkey::new_unique();
    for sol_in in [SOL / 10, 3 * SOL, 7 * SOL + 123_457] {
        refresh(&mut amm, &c);
        let q = amm
            .quote(&QuoteParams { amount: sol_in, input_mint: WSOL, output_mint: to_pk(&c.keys.mint), swap_mode: SwapMode::ExactIn, fee_mode: Default::default() })
            .unwrap();
        assert_eq!(q.in_amount, sol_in);
        let metas = amm.get_swap_and_account_metas(&swap_params(&amm, &user.pubkey(), WSOL, to_pk(&c.keys.mint), sol_in, &jup)).unwrap().account_metas;
        let bag0 = c.bag(&user.pubkey());
        let lamports0 = c.lamports(&user.pubkey());
        let had_ata = c.account(&h::ata(&user.pubkey(), &c.keys.mint)).is_some();
        execute(&mut c, &user, metas, FlooredAmm::swap_buy_data(sol_in, q.out_amount)).unwrap_or_else(|l| panic!("swap_buy failed:\n{l}"));
        let ata_rent = if had_ata { 0 } else { c.rent(165) };
        assert_eq!(c.bag(&user.pubkey()) - bag0, q.out_amount, "tokens received ≠ quote");
        assert_eq!(lamports0 - c.lamports(&user.pubkey()), sol_in + h::SIG_FEE + ata_rent, "SOL charged ≠ quote");
        // the model stays in step (the harness mirror would catch any drift)
        c.model.swap_buy(sol_in);
        c.assert_mirror();
    }
}

#[test]
fn sell_quote_matches_execution_including_the_brake() {
    let whale = Keypair::new();
    let mut c = Chain::graduated(&whale);
    let jup = Pubkey::new_unique();
    let mut amm = amm_for(&c);

    // 1. a small sell: fully executed, quote exact
    let small = h::tok(1_000_000);
    refresh(&mut amm, &c);
    let q = amm
        .quote(&QuoteParams { amount: small, input_mint: to_pk(&c.keys.mint), output_mint: WSOL, swap_mode: SwapMode::ExactIn, fee_mode: Default::default() })
        .unwrap();
    assert_eq!(q.in_amount, small, "small sell fully executable");
    let metas = amm.get_swap_and_account_metas(&swap_params(&amm, &whale.pubkey(), to_pk(&c.keys.mint), WSOL, small, &jup)).unwrap().account_metas;
    let bag0 = c.bag(&whale.pubkey());
    let lamports0 = c.lamports(&whale.pubkey());
    execute(&mut c, &whale, metas, FlooredAmm::swap_sell_data(small, q.out_amount)).unwrap_or_else(|l| panic!("swap_sell failed:\n{l}"));
    assert_eq!(bag0 - c.bag(&whale.pubkey()), small);
    assert_eq!(c.lamports(&whale.pubkey()) - lamports0 + h::SIG_FEE, q.out_amount, "SOL received ≠ quote");
    let slot = c.slot();
    c.model.sell(slot, small, false, None);
    c.assert_mirror();

    // 2. a sell far above the window allowance: quoted on the allowance only, executed likewise,
    //    nothing queued, the rest stays in the wallet
    let huge = h::tok(400_000_000);
    refresh(&mut amm, &c);
    let q = amm
        .quote(&QuoteParams { amount: huge, input_mint: to_pk(&c.keys.mint), output_mint: WSOL, swap_mode: SwapMode::ExactIn, fee_mode: Default::default() })
        .unwrap();
    assert!(q.in_amount < huge, "the brake caps the executable part: {} of {}", q.in_amount, huge);
    assert_eq!(q.in_amount, amm.sell_allowance());
    let metas = amm.get_swap_and_account_metas(&swap_params(&amm, &whale.pubkey(), to_pk(&c.keys.mint), WSOL, huge, &jup)).unwrap().account_metas;
    let bag0 = c.bag(&whale.pubkey());
    let lamports0 = c.lamports(&whale.pubkey());
    execute(&mut c, &whale, metas, FlooredAmm::swap_sell_data(huge, q.out_amount)).unwrap_or_else(|l| panic!("braked swap_sell failed:\n{l}"));
    assert_eq!(bag0 - c.bag(&whale.pubkey()), q.in_amount, "executed tokens ≠ quoted in_amount");
    assert_eq!(c.lamports(&whale.pubkey()) - lamports0 + h::SIG_FEE, q.out_amount, "SOL received ≠ quote");
    assert_eq!(c.coin().brake.queued_total, 0, "a router never queues");
    assert!(c.entry(&whale.pubkey()).is_none());
    let slot = c.slot();
    c.model.sell(slot, huge, false, None);
    c.assert_mirror();

    // 3. a min_sol_out above the quote is refused (price limit honoured)
    refresh(&mut amm, &c);
    c.next_window();
    refresh(&mut amm, &c);
    let q = amm
        .quote(&QuoteParams { amount: small, input_mint: to_pk(&c.keys.mint), output_mint: WSOL, swap_mode: SwapMode::ExactIn, fee_mode: Default::default() })
        .unwrap();
    let metas = amm.get_swap_and_account_metas(&swap_params(&amm, &whale.pubkey(), to_pk(&c.keys.mint), WSOL, small, &jup)).unwrap().account_metas;
    let logs = execute(&mut c, &whale, metas, FlooredAmm::swap_sell_data(small, q.out_amount + 1)).expect_err("must be refused");
    assert!(logs.contains("SlippageExceeded"), "{logs}");
}

#[test]
fn quote_tracks_window_rolls_through_update() {
    let whale = Keypair::new();
    let mut c = Chain::graduated(&whale);
    let other = c.wallet(50);
    let mut amm = amm_for(&c);
    // a buy lifts the brake reference to the new price; after update() the allowance is exactly
    // what the program would allow from that reference (≈ 11.8 % of the new, smaller T)
    refresh(&mut amm, &c);
    let a0 = amm.sell_allowance();
    c.swap_buy(&other, 10 * SOL);
    refresh(&mut amm, &c);
    let a1 = amm.sell_allowance();
    let st = c.coin();
    let from_state = floored_core::brake_allowed(floored_core::Params::DEFAULT.brake_drop_bps, st.brake.ref_sol, st.brake.ref_tok, st.pool_sol, st.pool_tok).unwrap();
    assert_eq!(a1, from_state, "allowance must follow the on-chain reference");
    assert!(a1 < a0, "fewer pool tokens after a buy, slightly smaller allowance: {a0} → {a1}");
    // a dump that consumes the window, then a new window: the allowance resets from the new price
    c.sell(&whale, h::tok(300_000_000), false);
    refresh(&mut amm, &c);
    let a2 = amm.sell_allowance();
    assert!(a2 < a1 / 20, "allowance nearly exhausted after the dump: {a2}");
    c.next_window();
    refresh(&mut amm, &c);
    let a3 = amm.sell_allowance();
    assert!(a3 > a2 * 10, "new window, new allowance: {a3}");
    let p = c.coin();
    let expected = floored_core::brake_allowed(floored_core::Params::DEFAULT.brake_drop_bps, p.pool_sol, p.pool_tok, p.pool_sol, p.pool_tok).unwrap();
    assert_eq!(a3, expected);
}
