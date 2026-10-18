# FLOORED

**Pump burns your dead money. We give it back.**

A memecoin launchpad on Solana where the liquidity pool belongs to the holders.

* **The floor.** After graduation, any holder can `redeem(x)`: burn `x` tokens and receive `S·x/C` SOL straight from the pool (`S` = pool SOL, `C` = circulating supply). The pool burns `T·x/C` of its own tokens in the same step, so the price does not move and nobody else's floor falls. The last holder takes every lamport left. The floor is a balance you can read, not a promise.
* **The brake.** No sale, or group of sales, can print more than 20 % under the window's high in 60 seconds (150 slots). What does not fit is queued in escrow and served pro rata of size, one aggregate swap per window, same percentage and same price for everyone. The dev waits like everyone else. `redeem` is never braked.
* **Nothing else.** No LP token, no admin withdrawal, no pause, no oracle, no mint or freeze authority after creation, parameters frozen per coin. See [SECURITY.md](SECURITY.md).

Program id (devnet): `E7ZbamLD8wenjjHitR8bUHwuNKA4Em39sqybnhk3nc87`

## Repository

| path | what | status |
|---|---|---|
| `core/` | `floored-core`: all the arithmetic (curve, pool, floor, brake, queue) in pure integer Rust, no Solana dependency. 24 tests incl. 4 property tests of the invariants. | tested |
| `programs/floored/` | Anchor 1.2 program, thin wrapper over the core: 15 instructions, 10 events, IDL in `idl/floored.json`. | built, deployed on devnet |
| `tests-rs/` | 16 on-chain scenarios on LiteSVM with a lamport-exact shadow model (`assert_mirror` after every operation), plus a randomized fuzz driver over all 15 instructions (`tests/fuzz.rs`, 20 seeds × 300 steps in the normal run, long mode on demand). | passing |
| `packages/sdk/` | `@floored/sdk`: exact BigInt port of the core (parity-tested against Rust vectors), PDAs, decoders, instruction builders, event parser, formatters. 63 tests. | passing |
| `packages/demo/` | devnet scripts: initialize, launch to graduation, the 30 % dump through the brake, redemptions, "verify the floor from three reads". | see below |
| `packages/jupiter-amm/` | `jupiter-amm-interface` implementation (quotes from the core, brake-aware) with a quote-versus-execution parity test on the built program. Jupiter routes native-SOL venues through its wrapped variants, no on-chain adapter needed; see `docs/jupiter-listing.md`. | passing |
| `apps/indexer/` | Helius webhook → Postgres (Drizzle), candles with the floor series, minute snapshots, holders, global stats, REST + websocket API, backfill. | see its README |
| `apps/web/` | Next.js 16 site: home, coin page with the orange floor line under the candles, create, portfolio, how it works, stats, rug-proof challenge, dynamic OG images, English only, wallet adapter. | see its README |
| `assets/` | generated artwork, logo SVGs, prompts for what is left to generate. | see `assets/README.md` |
| `docs/` | launch thread, before-mainnet checklist, Jupiter listing notes. | |
| `DESIGN.md` | the design system (tokens, type, motion, every page). | |

## The numbers

Defaults (`GlobalConfig.params`, copied into every coin at creation and frozen):

| | |
|---|---|
| Supply | 1 000 000 000 tokens, 6 decimals, minted once; mint authority revoked, no freeze authority |
| Curve | constant product with virtual reserves 30 SOL / 1 073 000 000 tokens; ≈ 793 100 000 tokens sold; graduation at 85 real SOL (the last buy is capped exactly there) |
| Curve fee | 1 %: 0.4 % creator, 0.3 % protocol, 0.3 % floor reserve (poured into the pool at graduation) |
| Graduation | permissionless `graduate` (crank reward 0.002 SOL out of accrued protocol fees): pool = 85 SOL + floor reserve, every unsold token. Nothing burned. At that instant the floor equals the average price paid on the curve. |
| Pool fee | 0.5 %: 0.2 % stays in the pool, 0.2 % creator, 0.1 % protocol |
| Redeem | `S·x/C` minus 0.5 % kept in the pool (waived for the last holder) |
| Brake | max drop 20 % per 150-slot window versus the window's high; queued sells served pro rata per window; `cancel_queue`, `claim_queue`, `queue_to_redeem` at any time |

## Verify the floor yourself

Three reads and one division. For any coin:

```
S = lamports(pool_sol_vault)  − rent-exempt minimum of 0 bytes
T = token amount(pool_token_vault)
Q = token amount(queue_escrow)
C = mint supply − T − Q
floor = S / C            (SOL per token, both in base units)
```

PDAs (program `E7Zb…nc87`): `coin = ["coin", mint]`, `pool_sol_vault = ["pool_sol", coin]`, `pool_token_vault = ["pool_tokens", coin]`, `queue_escrow = ["queue_escrow", coin]`. The script `pnpm --filter @floored/demo verify <mint>` does exactly this with raw RPC calls, and the "How it works" page does it in the browser.

Why `redeem` cannot lower anyone's floor: after `redeem(x)`, `S' = S − S·x/C` and `C' = C − x`, so `S'/C' = S/C` (and a little more, because 0.5 % stays). Why it cannot move the price: `T' = T − T·x/C`, so `S'/T' = S/T`. Both are property-tested in `core/src/tests.rs` and replayed on-chain in `tests-rs`.

What the floor is not: a monotone number. A market sell above the floor takes more than its floor share and lowers the floor of the others a little; buys and every fee raise it. The floor is the exact minimum you can take out, right now, with one instruction nobody can block.

## Build and test

Prerequisites: Rust stable, Solana/Agave CLI with `cargo-build-sbf` (on this Windows machine `scripts/env-windows.sh` wires a no-admin toolchain; on Linux/macOS install the Solana CLI normally), Node 24, pnpm 11, Docker (for the indexer's Postgres).

```bash
pnpm install
pnpm test:core          # floored-core unit + property tests
pnpm build:program      # cargo-build-sbf → programs/floored/target/deploy/floored.so
pnpm test:program       # builds, then LiteSVM scenarios + the fuzz driver in tests-rs
# FUZZ_MINUTES=30 cargo test --release --test fuzz fuzz_long -- --ignored --nocapture   (in tests-rs: long fuzz mode)
pnpm idl                # regenerates programs/floored/idl/floored.json (no anchor CLI needed)
pnpm --filter @floored/sdk test
pnpm --filter @floored/indexer test
pnpm --filter @floored/web build
```

Test vectors for the TypeScript port: `cargo test -p floored-core --release vectors -- --ignored --nocapture` (already saved as `packages/sdk/vectors.json`).

## Deploy and run on devnet

```bash
# 1. program (already live at E7Zb…nc87; redeploy after changes)
solana program deploy programs/floored/target/deploy/floored.so \
  --program-id target/deploy/floored-keypair.json -u devnet -k keys/floored-devnet.json

# 2. config, demo coin, dump, redemptions (packages/demo, needs devnet SOL in keys/floored-devnet.json)
pnpm --filter @floored/demo init-config
pnpm --filter @floored/demo launch
pnpm --filter @floored/demo dump
pnpm --filter @floored/demo redeem
pnpm --filter @floored/demo smoke    # after any redeploy: one small buy, events decoded with the SDK
pnpm --filter @floored/demo verify   # the floor from three raw reads

# 3. indexer (Postgres via docker compose, Helius webhook or backfill)
cp apps/indexer/.env.example apps/indexer/.env && pnpm --filter @floored/indexer db:migrate
pnpm --filter @floored/indexer backfill && pnpm --filter @floored/indexer dev

# 4. site
cp apps/web/.env.example apps/web/.env.local   # NEXT_PUBLIC_RPC_URL, NEXT_PUBLIC_API_URL (unset → mock mode)
pnpm dev
```

Devnet note (live addresses in [docs/devnet.md](docs/devnet.md)): the full curve needs 85 SOL, which devnet faucets do not hand out in one go. `packages/demo` reads the parameters from the on-chain config, so a devnet config initialised with scaled-down curve numbers (same 30:85 ratio) runs the whole demo with a few SOL; the mainnet config uses the defaults above.

## Events

Every instruction emits an Anchor event (`Program data:` logs). `Trade` mirrors Pump's `TradeEvent` fields so existing indexers map it quickly:

| FLOORED `Trade` | Pump `TradeEvent` |
|---|---|
| `mint`, `user`, `is_buy`, `sol_amount`, `token_amount`, `timestamp` | same |
| `sol_reserves`, `token_reserves` (virtual on the curve, pool after) | `virtual_sol_reserves`, `virtual_token_reserves` |
| `real_sol` | `real_sol_reserves` |
| `pool_sol`, `pool_tok`, `queued`, `supply`, `fee_total`, `fee_to_floor`, `is_queue_fill`, `queued_remainder`, `phase` | FLOORED only |

Other events: `CoinCreated`, `Graduated`, `Redeemed`, `BrakeEngaged`, `BrakeReleased`, `QueueJoined`, `QueueProcessed`, `QueueSettled`, `FeesClaimed`. Full field lists in `programs/floored/src/events.rs` and the IDL.

## Instructions

`initialize`, `update_config` (defaults for future coins and the fee recipient only), `create_coin`, `buy`, `sell`, `graduate`, `swap_buy`, `swap_sell`, `redeem`, `process_queue`, `claim_queue`, `cancel_queue`, `queue_to_redeem`, `claim_creator_fees`, `claim_protocol_fees`. Accounts and arguments: `programs/floored/src/contexts.rs`, builders in `packages/sdk/src/instructions.ts`.

## Before mainnet

External audit, fuzzing against the built program, Squads multisig then immutability, parameter review, Jupiter submission, Dexscreener / GMGN / Axiom / Photon onboarding, cranks and monitoring, legal. The ordered list with details: [docs/before-mainnet.md](docs/before-mainnet.md). The operational runbook (mainnet deploy script, Vercel chain mode, cranks, what the user must fund): [docs/LAUNCH.md](docs/LAUNCH.md).

## License

MIT.
