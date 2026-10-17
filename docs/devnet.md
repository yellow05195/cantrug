# Devnet deployment

Live as of 2026-10-17.

| | |
|---|---|
| Program | `E7ZbamLD8wenjjHitR8bUHwuNKA4Em39sqybnhk3nc87` (upgradeable, authority = `A3tpvBJccnhTETYGfVAbReuKhE33gdXqGCLtwAScHYVN`, the devnet deployer in `keys/floored-devnet.json`, not committed). First deploy slot 512047604 (580 KB); upgraded in slot 512053014 with the extended events (`timestamp` on every event, `tokens_sold`, `queued_after`, `reason`), built with `opt-level = "z"` (458 KB); upgraded again in slot 512069499 with the two fixes found by the fuzzer (dust sweep of the queue, clean `StaleQueueEntry`). The demo coin's transactions before that slot carry the earlier, shorter event layout (no `timestamp` on the queue events, no `tokens_sold`, `queued_after`, `reason`): a backfill of this coin must default those trailing fields. |
| Config | PDA `["config"]`; parameters = mainnet defaults with the SOL side scaled 1/100 (virtual 0.3 SOL, graduation 0.85 SOL, crank reward 0.00002 SOL, creation fee 0.002 SOL). Token numbers, fees and brake identical to mainnet. |
| Demo coin | **FLRD** "Floored Demo", mint `7PwqFN6yrgWQDim5RFR4au4znTbr2NBGH6ND1JQgFVYY` |
| Creator | `A3tpvBJccnhTETYGfVAbReuKhE33gdXqGCLtwAScHYVN` |
| "Dev" wallet (the dumper of the rug-proof challenge) | `5rA2GzrTpitKbeeuK9EPzvZR1TaCGZ5feZ2PhJmJ7evE` |
| Buyers | alice `6Lzf2LdCzaSRKvCkTp4VPxD6gdog8zHxbUq2Mdmif9fn`, bob `72JsUxuh9keNwBH3Xj2g8GeYocbh6oVFRgjDtAEG7vvK` |

Signatures of every step are in `packages/demo/.demo-state.json` (create, 8 buys, graduate, dump + queue fills + exit at floor, redemptions). The graduation transaction: `US9xtEphBaRg9yNz4HAgRbhz8DjywEyi4WDuqhv2FcHmDqJoWQmAmv57gZK1K2qgbbrVYqVDfuRgueZS1Vci9Up`.

Observed at graduation (from raw account reads, `pnpm --filter @floored/demo verify`):

```
S (pool_sol_vault − rent) = 0.8525 SOL
T (pool_token_vault)      = 206 913 043.47 tokens
C = supply − T − Q        = 793 086 956.52 tokens
floor = S / C             = 1.0750e-9 SOL per token
price = S / T             = 4.1203e-9 SOL per token
```

The last curve buy was charged 0.0325 SOL instead of the 0.102 SOL offered: the curve closes at exactly 0.85 real SOL.

## The rug-proof challenge, as it happened (`pnpm --filter @floored/demo dump`)

1. The dev sold its whole bag (≈ 40 % of the curve supply) in one `swap_sell`: only the window allowance executed, the price printed exactly 20 % under the window high, the rest went to the queue (`2kWvEJQB…`).
2. Alice bought into the dip at once (buys are never braked).
3. Bob cranked `process_queue` on each following window (`4aKydgpi…`, `61qUGEBp…`, `N3JvC2cY…`): one aggregate swap per window, the dev served pro rata, the brake reference stepping down by at most 20 % per window.
4. The dev gave up waiting and called `queue_to_redeem` (`96zVDB2R…`): the queued rest was redeemed at the floor instantly; the queue emptied (1 base unit of rounding dust left in the escrow, as documented).

## Redemptions (`pnpm --filter @floored/demo redeem`)

| step | tokens redeemed | SOL received (= quote, to the lamport) | floor after (SOL/token) | price / floor |
|---|---|---|---|---|
| before | | | 8.2430e-10 | 2.179 |
| alice, half | 78 398 949.27 | 0.0643 | 8.2578e-10 | 2.179 |
| bob, all | 105 823 865.24 | 0.0869 | 8.2966e-10 | 2.179 |
| alice, rest | 78 398 949.27 | 0.0647 | 8.3914e-10 | 2.179 |

Each redemption paid exactly `S·x/C` minus 0.5 % kept in the pool, lifted the floor of the remaining holders, and left the ratio price/floor unchanged (the pool price did not move). Signatures: `kM7TDtbe…`, `3pLFzRtC…`, `4UyY1cAt…` (full list in `packages/demo/.demo-state.json`).

The floor fell from 1.075e-9 at graduation to 8.24e-10 during the dump: market sells above the floor lower it (the seller takes more than the floor share), which is the documented, intended behaviour; it never fell through a redemption.

Re-running the demo from scratch: delete `packages/demo/.demo-state.json`, fund `keys/floored-devnet.json` with ≈ 1.2 devnet SOL, then `init-config` (no-op if the config exists), `launch`, `dump`, `redeem`.
