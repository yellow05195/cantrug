# Launch thread (X), English

Post as a thread from @flooredfun. One image or clip per tweet where noted. Replace `{demo}` with the live demo coin link and `{sig}` with the on-chain signatures of the demo.

---

**1/**
Pump admits that over $100M of "dead liquidity" gets stuck in dead coins every year.

Since July they burn it.

We built the opposite. Thread.

*(image: hero-slab.webp)*

**2/**
On FLOORED the pool belongs to the holders.

At any moment, any holder can hand back their tokens and take their exact share of the SOL in the pool.

We call it the floor. It is a balance, not a promise:

floor = pool SOL ÷ circulating supply

**3/**
When a coin graduates (≈85 SOL raised), all the curve SOL goes into a pool owned by the program. No LP token. No dev key. No admin key. Not even ours.

At that moment the floor equals the average price every buyer paid on the curve.

**4/**
Redeeming does not dump the chart.

When you hand back x tokens, the pool pays S·x/C and burns T·x/C of its own tokens. Price unchanged. Everyone else's floor unchanged (slightly up, you leave 0.5 % behind).

The last holder takes the last lamport.

**5/**
And no coin can do −90 % in one second.

No sale, or group of sales, can print more than 20 % under the window's high in 60 seconds. What does not fit is queued and served pro rata, one aggregate swap per window, same percentage and same price for everyone.

The dev waits like everybody else.

**6/**
Here is a dev dumping 30 % of the supply on a FLOORED coin.

Watch the staircase. Watch the orange line not move.

*(clip: the brake demo, vertical cut)*

{sig}

**7/**
If the price ever trades under the floor, buying from the pool and redeeming is free money, so bots lift it back. The price cannot stay under the floor.

**8/**
Verify it yourself. Three accounts, one division:

pool_sol_vault balance − rent = S
pool_token_vault amount = T
mint supply − T − queued = C
floor = S / C

Program: E7ZbamLD8wenjjHitR8bUHwuNKA4Em39sqybnhk3nc87
Code, tests, invariants: github.com/floored-fun/floored

**9/**
Fees, in full:
Curve: 1 % (0.4 creator, 0.3 protocol, 0.3 poured into the floor at graduation).
Pool: 0.5 % (0.2 stays in the pool, 0.2 creator, 0.1 protocol).
Redeem: 0.5 %, stays in the pool.

Every trade feeds the floor.

**10/**
The first coin on FLOORED goes live today: {demo}

Try to rug it. We dare you.

floored.fun

---

## Rug-proof challenge post (day 1, after the thread)

A dev wallet holds 30 % of $CHALLENGE and will dump everything at 18:00 UTC. Open the coin page and watch: the brake engages, the price steps down 20 % per minute at most, the floor holds, and anyone can redeem at the floor the whole time. Transactions will be linked in this thread as they land.

## Creator kit, one-liners for coin pages

"Launched on FLOORED. Can't go to zero."
"Floor: {floor} SOL per token, redeemable any time."
"No LP, no dev key, no −90 % candles. Verify: floored.fun/coin/{mint}"
