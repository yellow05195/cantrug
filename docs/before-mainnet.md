# Before mainnet

What exists today, what is verified, and the ordered list of what still has to happen before a single lamport of real money touches the program. Nothing on this list is optional.

## Done (devnet)

- Program `E7ZbamLD8wenjjHitR8bUHwuNKA4Em39sqybnhk3nc87` deployed on devnet, upgrade authority = the devnet deployer key.
- `floored-core`: 24 tests, 4 property tests (4 000 cases each) on the floor, price and pro-rata invariants.
- `tests-rs`: 14 on-chain scenarios in LiteSVM with a lamport-exact shadow model (dev dump 30 %, everyone redeems, arbitrage under the floor, dead coin 24 h, sybil split, queue across graduation, no admin path).
- TypeScript SDK with exact parity against Rust vectors; indexer + API; website.

## 1. External audit (blocking)

Scope: `programs/floored`, `core`, the LiteSVM harness. Areas to insist on: lamport accounting of the five vaults, the brake accumulator (`scale`/`sol_index` precision and epoch closing), PDA creation paths (`create_pda_account` with pre-funded addresses), CPI ordering, `queue_to_redeem` and `redeem` with `C` close to zero, rounding directions, compute budgets with a hostile number of accounts. Deliver the report publicly. Fix, re-audit the diff.

## 2. Fuzzing against the built program

Done in-repo: `tests-rs/tests/fuzz.rs` (driver in `tests-rs/src/fuzz.rs`) sends random sequences of all 15 instructions with random slot warps to the built `floored.so` in LiteSVM, predicts every outcome with the shadow model (success, or the exact error name), and after each transaction checks the state mirror, lamport conservation over every account the program can touch (the known-account total moves by exactly the transaction fee), escrow ≥ queue, and that no redeem lowered the floor or the price. Refused transactions must leave every account byte-identical.

```bash
cd tests-rs && cargo test --release --test fuzz                     # 20 seeds × 300 steps, part of the normal run
FUZZ_SEED=7 FUZZ_STEPS=1000 cargo test --release --test fuzz        # reproduce one seed
FUZZ_MINUTES=30 cargo test --release --test fuzz fuzz_long -- --ignored --nocapture   # long mode
```

Every panic message starts with `seed N step M`. Two bugs were found and fixed on the first runs (dust left in the queue blocked every sell of the coin at the next window roll; re-queueing with a position from an old epoch failed with an account-owner error instead of `StaleQueueEntry`); both have regression scenarios in `tests-rs/tests/program.rs`. Still to do before launch: run the long mode for 24 h on a CI box (the 30-minute run is recorded in SECURITY.md), and add a Trident target so the fuzzing also mutates raw instruction data and account lists (the in-repo fuzzer only sends well-formed transactions).

## 3. Upgrade authority to Squads, then immutable

Squads 3-of-5 multisig as upgrade authority and config authority before the first mainnet coin. 48 h timelock. After the audit fixes and 30 days without incident: `--final`. Publish the signatures.

## 4. Parameters review

Defaults are Pump-like (30 / 1 073 000 000 virtual reserves, 793 100 000 curve supply, 85 SOL). Decide: creation fee (0.02 SOL in the devnet config), crank reward (0.002 SOL), the brake window (150 slots ≈ 60 s) and drop (20 %). Simulate the brake on real Pump dump traces (the indexer's `candles` table can replay them) before freezing.

## 5. Indexing partners

- **Dexscreener**: submit the program as a DEX with the `Trade` event mapping (`sol_amount`, `token_amount`, `sol_reserves`/`token_reserves`, `is_buy`) and the pool address = `pool_token_vault`. They need an HTTP endpoint for pairs and events: the indexer exposes `/api/coins` and `/api/coins/:mint/trades`; add their schema adapter (`/dexscreener/latest-block`, `/asset`, `/pair`, `/events`).
- **GMGN, Axiom, Photon**: send the IDL, the event spec (`programs/floored/src/events.rs`) and the Pump field mapping table (README, "Events"). Offer the websocket.
- **Jupiter**: see `docs/jupiter-listing.md`. No program change: Jupiter wraps native-SOL venues itself (as for Pump); submit the crate with its parity test once the audit report exists.
- **Birdeye / Solscan**: token metadata is standard Metaplex, nothing to do; register the program name.

## 6. Operations

- Helius webhook on mainnet with a dedicated API key, plus a Yellowstone gRPC fallback for the indexer.
- Two cranks (process_queue, graduate) on independent hosts, funded wallets, alerting when a coin with a queue has not been served for 3 windows.
- Backups of Postgres; the chain is the source of truth, `backfill.ts` rebuilds everything.
- Status page; incident runbook; `security@` inbox with a bounty (Immunefi-style, up to 10 % of funds at risk, cap to be set).

## 7. Legal and product

- Terms, risk disclosure (the floor is a current minimum, not a guarantee of future value; market sells above the floor lower it).
- Geo-restrictions as advised by counsel.
- Creator kit assets and the launch video (Higgsfield generation queued; the brief and prompts are in `assets/README.md`).

## 8. Launch day

- Deploy, initialize config with the frozen parameters, transfer authority to Squads, verify the build (`solana-verify`), publish the IDL on-chain (`anchor idl init` or the Anchor IDL program).
- Launch the demo coin, run the Rug-proof challenge on it with a public dev wallet, link every signature in the thread.
