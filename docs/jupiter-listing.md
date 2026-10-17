# Jupiter listing

`packages/jupiter-amm` implements `jupiter_amm_interface::Amm` (v1.0.0-beta.0) for graduated FLOORED coins. Quotes are exact (they call `floored-core`), the brake is modelled (a sell is quoted on the part the window allows), and `get_swap_and_account_metas` returns the account list of the program's native `swap_buy` / `swap_sell` in IDL order.

## Native SOL, not WSOL: no program change needed

FLOORED pools hold native SOL in a program-owned lamport vault; `swap_buy` takes SOL from the user's system account and `swap_sell` pays SOL to it. We first assumed Jupiter needed WSOL token accounts on both legs and planned two adapter instructions. That is not how Jupiter integrates native-SOL venues: the Pump bonding curve, Moonshot and Boop are routed through the `PumpWrappedBuy/Sell`, `MoonshotWrappedBuy/Sell`, `BoopdotfunWrappedBuy/Sell` variants of `jupiter_amm_interface::Swap`, where Jupiter's own program unwraps WSOL to SOL before the CPI and wraps the SOL received after it. Jupiter's `jupiter-amm-test-kit` likewise "executes your program's native swap instruction in LiteSVM" and compares the token deltas to the quote. FLOORED follows the same path: Jupiter adds `FlooredWrappedBuy` / `FlooredWrappedSell` when it accepts the integration; nothing changes on-chain, and the audit scope stays what it is.

What the program guarantees that makes this safe for a router:

* `swap_buy` charges exactly `sol_in` (fee included) and delivers `pool_buy(sol_in).tokens_out`, never less (`min_tokens_out` enforced).
* `swap_sell` with `queue_remainder = false` sells exactly `min(tokens_in, allowance)` and pays `pool_sell(executed).sol_net`; the rest of the order stays in the wallet, nothing ever enters the brake queue on behalf of a router. The quote reports `in_amount = executed`, so quote and execution agree to the lamport.
* Both are single top-level instructions with one signer (the user), the shape the test kit requires.

## What the crate does

* `FlooredAmm::from_keyed_account` reads a `CoinState` account (the market); only `phase == 1` coins are markets.
* `get_accounts_to_update` is the `CoinState` itself (reserves, brake reference, window, queue total); `update` re-decodes it. The pool vaults never need reading: `pool_sol` / `pool_tok` in the state equal the vault balances (checked after every instruction by `check_vault`).
* `quote`: SOL → token uses `pool_buy`; token → SOL uses `pool_sell` on `min(amount, allowance)`, with the window roll modelled from the clock slot (`sell_allowance`).
* `get_swap_and_account_metas`: the native instruction's account list; `swap_buy_data` / `swap_sell_data` build the instruction data (`swap_sell` always with `queue_remainder = false`).
* `tests/parity.rs`: the built `floored.so` runs in LiteSVM (same harness as `tests-rs`); for a graduated coin the test snapshots the `CoinState`, builds the `FlooredAmm` from it, quotes, executes the native instruction with the metas and data from the crate, and asserts the token and lamport deltas equal the quote exactly, for buys and for sells that are partially braked. Run: `cd packages/jupiter-amm && cargo test --release` (after `pnpm build:program`).

## Market discovery

Markets are `CoinState` accounts owned by the program with `phase == 1`: `getProgramAccounts` with `memcmp` offset 8 + 32 + 32 + 56 = 128, bytes `[0x01]`, or the indexer endpoint `GET /api/coins?phase=graduated`. Reserve mints: `[WSOL, mint]`.

## Steps

1. Submit through Jupiter's AMM integrators form with this crate, the parity tests, the devnet market `7PwqFN6yrgWQDim5RFR4au4znTbr2NBGH6ND1JQgFVYY`, the security audit (prerequisite, see `docs/before-mainnet.md`), traction and team.
2. Jupiter forks the SDK, adds the `FlooredWrappedBuy/Sell` variants and the wrapping logic in its program; we replace the `Swap::TokenSwap` placeholder with those variants.
3. After their deploy, verify a route SOL → FLRD → SOL on jup.ag against the on-chain floor and the brake (a sell larger than the window allowance must be quoted on the allowance only).
4. Keep markets above Jupiter's liquidity criteria (Market Listing) so they stay routable.
