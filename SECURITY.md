# Security

FLOORED holds other people's SOL. This document says exactly who can touch it (nobody), how the program is upgraded (through a multisig, then not at all), what has been verified, and how to report a problem.

Program id (devnet and, when deployed, mainnet): `E7ZbamLD8wenjjHitR8bUHwuNKA4Em39sqybnhk3nc87`.

## 1. What the program cannot do

The guarantees below are structural: there is no instruction in the program that could violate them, so they do not depend on anyone behaving well.

| Promise | Why it holds |
|---|---|
| Nobody can withdraw SOL from a curve, a floor reserve, or a pool | The five lamport vaults of a coin are 0-byte accounts owned by the program. The only instructions that debit them are `sell`, `swap_sell`, `redeem`, `graduate` (curve → pool, same coin), `process_queue`, the three queue settlements, and the two fee claims. Every one of them pays a fixed formula from `floored-core` to the trader, the queue, or the fee recipients. `grep -n "move_lamports" programs/floored/src/*.rs` lists every debit. |
| No admin key over funds | `GlobalConfig.authority` can call exactly one instruction, `update_config`, whose account list is `[authority, config]`. It cannot name a coin, a vault, or a token account. The on-chain test `no_instruction_can_hand_vault_sol_to_the_authority` checks the IDL for this. |
| No pause, no freeze, no blacklist | There is no such instruction and no such flag in any account. The mint's freeze authority is `None` from creation; the mint authority is revoked inside `create_coin` after the single mint of 1 000 000 000 tokens. |
| No oracle | Every price, floor and brake decision is computed from the program's own accounts (`real_sol`, `tokens_sold`, `pool_sol`, `pool_tok`, `queued_total`, `mint.supply`). No external account is read. |
| Parameters are frozen per coin | `CoinParams` is copied from `GlobalConfig` into `CoinState` at creation and no instruction writes to it afterwards. |
| No LP token | The pool is two vaults owned by PDAs. There is nothing to "pull". |
| Rounding never favours the withdrawer | Payouts floor, fees ceil, pool tokens burned on redeem ceil (`floored-core`, property-tested). |

## 2. The invariants and how they are tested

* **I1, the floor never falls through a redemption.** For any pool `(S, T)`, queue `Q`, supply and `x ≤ C`: `S'/C' ≥ S/C`. `core/src/tests.rs::redeem_invariants`, 4 000 random cases per run.
* **I2, the pool price never falls through a redemption.** `S'/T' ≥ S/T`, and it moves only by rounding plus the exit fee kept in the pool. Same test.
* **I3, the brake queue is served pro rata at one price.** For any two queued sizes and any fill: equal fill percentage and equal price within one base unit. `queue_pro_rata`, 4 000 cases. On-chain: `dev_dump_30_percent_is_braked_and_served_pro_rata`, `splitting_a_dump_across_wallets_does_not_help`.
* **The brake bound is tight.** Selling the allowance never prints more than `drop_bps` under the window reference; selling 0.01 % more does. `brake_bound_holds`.
* **SOL is conserved to the lamport.** The LiteSVM harness replays every instruction on `floored-core` and asserts every `CoinState` field and every vault balance (`rent + tracked`) are identical (`tests-rs/src/lib.rs::assert_mirror`), after every operation of every scenario.
* **The last holder empties the pool**, with no exit fee. `everyone_redeems_last_holder_takes_every_lamport`.
* **Arbitrage closes under the floor.** `price_under_the_floor_is_an_arbitrage_that_lifts_it`.
* **A coin dead for 24 h still redeems at the same floor.** `dead_coin_24h_later_floor_is_intact`.

Run everything: `pnpm test:core && pnpm test:program`.

## 3. Known limits, by design

* **Market sells above the floor lower the floor of the others.** A seller at a price above `S/C` takes more SOL than their floor share. The floor is a verifiable minimum at every instant, not a monotone number. Only `redeem` is guaranteed not to lower it; buys and every fee raise it.
* **Queue fills happen once per window roll, not per elapsed window.** If nobody touches a coin for ten windows, the queue gets one fill on the next activity. The crank is permissionless and paid from the protocol share of the fill's own fee, so a coin with a queue and a cranker is served every window.
* **The brake reference is the window high.** A buy raises the reference immediately; a sell may then only execute down to 80 % of that high within the window. Buyers inside a window are protected against the dump that follows; a thin coin that spikes on a small buy will queue the next sells. This is intended.
* **Queued tokens are outside `C`.** The floor shown while a queue exists is computed on the circulating supply without the escrow. `queue_to_redeem` first puts the tokens back in `C`, then redeems them, so it never pays more than the floor the others see.
* **Dust.** Up to one base unit per queued position may stay in the escrow, and up to one lamport per position in the queue vault. Nothing is lost to anyone's benefit; it simply stays with the holders.
* **Epoch records.** A seller whose queue position belongs to a closed epoch must settle it (`claim_queue` / `cancel_queue` / `queue_to_redeem`) before queueing again on that coin. The frontend bundles the two instructions.
* **Compute.** `sell` / `swap_sell` do up to three CPIs plus two PDA derivations and fit under 200 k CU; `create_coin` needs about 250 k CU (set the compute budget).

## 4. Upgrade authority and immutability

1. Devnet: upgrade authority = the deployer key in `keys/` (not committed).
2. Mainnet launch: upgrade authority = a **Squads** multisig (3 of 5: two founders, one engineer, two independent members). Every upgrade is proposed with the diff and the test report, with a 48 h timelock.
3. After the external audit and 30 days of mainnet operation without an incident: `solana program set-upgrade-authority --final`. The program becomes immutable. The config authority (which can only change defaults for future coins and the fee recipient) also moves to the multisig; it is never able to move funds, before or after.

The three steps are published on the site's "How it works" page with the transaction signatures.

## 5. Audit status

* Internal review against the Trail of Bits smart-contract checklist and the Solana-specific items (owner checks, signer checks, PDA seeds, arithmetic, CPI ordering, re-initialisation, account confusion, lamport balance invariants): done, this repository.
* External audit: **not yet**. This is a hard prerequisite of mainnet (see README, "Before mainnet").
* Fuzzing: property tests on the core (proptest), and a randomized driver against the built program (`tests-rs/tests/fuzz.rs`: random sequences of all 15 instructions, outcome predicted by the shadow model, lamport conservation and state mirror checked after every transaction). It found two bugs before any deployment outside devnet: dust left in the brake queue made the next window fill fail and with it every sell of the coin (fixed: dust is swept into the venue for 0 SOL and the epoch closes), and re-queueing with a position from an older epoch failed with an account-owner error instead of `StaleQueueEntry` (fixed). Both are now regression scenarios. After the fixes, the long mode ran 30 minutes clean on 2026-10-17: 2 059 random seeds × 600 steps, 917 188 transactions, every outcome predicted by the model, state and vault balances identical after each one, no lamport created or destroyed, highest compute use 99 434 CU. A Trident target that also mutates raw instruction data is still to do.

## 6. Reporting

Email security@floored.fun. Please include the cluster, the coin mint, the transaction signatures and the expected versus observed numbers. Acknowledged within 24 h. We will publish a post-mortem for any issue that affected funds.
