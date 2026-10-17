# LAUNCH, the runbook

State on 2026-10-17 and the exact steps from here to a mainnet FLOORED. The
ordered security list (audit, Squads, immutability) is in
[before-mainnet.md](before-mainnet.md); this file is the operational side.

## What is ready

| piece | state |
|---|---|
| Program `E7ZbamLD8wenjjHitR8bUHwuNKA4Em39sqybnhk3nc87` | live on devnet, built `.so` 458 896 bytes (sha256 `b90de8a1…`), 16 LiteSVM scenarios + fuzz green, core 24 tests, SDK 65, indexer 87 |
| Same program id on mainnet | reserved by `target/deploy/floored-keypair.json`, **not deployed yet** (needs SOL, see below) |
| Mainnet deployer / config authority | `keys/floored-mainnet.json` = `EpQt7k2KaSubGuz78NjVj2HkX8hNBjG769Z7CQArgQ1x` (0 SOL) |
| Crank wallet | `keys/floored-crank.json` = `GLuYjwGd34f55b2yezRVX7u5ezZk2AZdSBa2YYNVNDSq` (0 SOL; set as `CRANK_KEYPAIR` on Vercel) |
| Site | Vercel project `floored` (root `apps/web`), chain mode: no indexer, no Postgres, the site reads the chain through its own `/api/rpc` proxy and `/api/coins`, `/api/stats`, … route handlers |
| Uploads | Vercel Blob store `floored-uploads` (public), route `/api/upload`, wired automatically in live mode |
| Cranks | ride inside trades (`process_queue` before a buy or a redeem when a window closed with a queue, `graduate` after the buy that completes the curve) + cron backstop `/api/cron/crank` every 5 minutes |
| GitHub | `yellow05195/floored` (private) created; first push blocked, see step 0 |

## 0. Three things only the user can do

1. **Fund the mainnet deployer** `EpQt7k2KaSubGuz78NjVj2HkX8hNBjG769Z7CQArgQ1x` with **5 SOL**
   (rent for the program ≈ 2.33 SOL, the deploy writes a buffer of the same size first and
   refunds it, config account + fees ≈ 0.05 SOL; 5 leaves room for a demo coin).
2. **Fund the crank wallet** `GLuYjwGd34f55b2yezRVX7u5ezZk2AZdSBa2YYNVNDSq` with **0.05 SOL**
   (each crank costs ≈ 0.00002 SOL and earns the 0.002 SOL crank reward, so it refills itself).
3. **GitHub token scope**: the push was refused because `.github/workflows/ci.yml` needs the
   `workflow` scope. Run, in this terminal: `! gh auth refresh -h github.com -s workflow`
   then `git push -u origin main`.

Optional: the domain. `floored.fun` was free on 2026-10-17 (`floored.xyz` and `floored.app`
are taken). `vercel domains buy floored.fun` charges the Vercel card; then
`vercel domains add floored.fun floored` and set `NEXT_PUBLIC_SITE_URL=https://floored.fun`.

## 1. Mainnet program + config (one command)

```bash
bash scripts/deploy-mainnet.sh check     # read only: balances, program, config
PROTOCOL_FEE_RECIPIENT=8GhcnuEqLr3DgCQTwBhXcHxfEe2jvDLJXxi9E1DebT6s \
bash scripts/deploy-mainnet.sh deploy    # build, deploy under the fixed id, initialize the config
```

`deploy` uses `keys/floored-mainnet.json` as deployer, upgrade authority and config
authority, the Helius mainnet RPC from `~/.config/solana/cli/config.yml`, and initialises
the config with the mainnet defaults (30 virtual SOL, 85 SOL to graduate, 0.02 SOL creation
fee, 0.002 SOL crank reward, protocol fees to `PROTOCOL_FEE_RECIPIENT`, default: the deployer).
It is idempotent: re-running upgrades the program in place and skips the config if it exists.

Verify: `RPC_URL=<mainnet> DEPLOYER=keys/floored-mainnet.json pnpm --filter @floored/demo status`.

Later, after the audit window (irreversible): `bash scripts/deploy-mainnet.sh final`.
Or hand the authority to a Squads multisig first:
`solana program set-upgrade-authority E7Zb…nc87 --new-upgrade-authority <squads vault> -k keys/floored-mainnet.json -u <rpc>`.

## 2. Flip the site to mainnet

```bash
vercel env rm UPSTREAM_RPC_URL production -y && printf '%s' 'https://mainnet.helius-rpc.com/?api-key=<key>' | vercel env add UPSTREAM_RPC_URL production
vercel env rm NEXT_PUBLIC_CLUSTER production -y && printf '%s' 'mainnet-beta' | vercel env add NEXT_PUBLIC_CLUSTER production
vercel deploy --prod --yes
```

The rug-proof challenge keeps replaying the devnet FLRD episode (it reads devnet on its own,
`lib/chain/challengeRpc.ts`), so nothing else changes. Once a mainnet coin has been through a
real braked dump, point `NEXT_PUBLIC_CHALLENGE_MINT` / `NEXT_PUBLIC_CHALLENGE_DEV` at it and
set `NEXT_PUBLIC_CHALLENGE_RPC_URL` to the mainnet RPC.

## 3. Vercel environment (reference)

| variable | production value today | role |
|---|---|---|
| `UPSTREAM_RPC_URL` | Helius **devnet** url | the only place the RPC key lives; server routes and the `/api/rpc` proxy use it |
| `NEXT_PUBLIC_RPC_URL` | `/api/rpc` | browser → proxy (no key in the bundle) |
| `NEXT_PUBLIC_DATA` | `chain` | data mode: `mock` / `indexer` / `chain` |
| `NEXT_PUBLIC_MOCK` | `0` | |
| `NEXT_PUBLIC_CLUSTER` | `devnet` | explorer links, "devnet" tag in the header |
| `NEXT_PUBLIC_SITE_URL` | the deployment's origin | OG image URLs |
| `NEXT_PUBLIC_CHALLENGE_MINT` / `_DEV` | FLRD / `5rA2…7evE` | the replayed episode |
| `BLOB_READ_WRITE_TOKEN` | set by the Blob store | `/api/upload` |
| `CRON_SECRET` | `keys/floored-cron-secret.txt` | Vercel sends it to `/api/cron/crank` |
| `CRANK_KEYPAIR` | `keys/floored-crank.json` (JSON array) | signs the cron's cranks |

`NEXT_PUBLIC_API_URL` stays empty: set it only if the indexer (`apps/indexer`, Postgres +
Helius webhook) is hosted one day; the site then switches to websocket live updates and
full candle history. Chain mode polls `/api/events` every 5 s instead.

## 4. Launch day checklist

- [ ] step 0 done (SOL on both wallets, `gh auth refresh`)
- [ ] `bash scripts/deploy-mainnet.sh deploy` → paste the deploy slot and the config signature below
- [ ] `pnpm --filter @floored/demo status` shows `deployed yes`, config initialised, 0 coins
- [ ] site flipped (step 2), header shows no "devnet" tag, `/api/cron/crank` answers 200 with `crank_sol > 0`
- [ ] create the first coin from the site with a real image (Blob URL in the metadata, < 200 bytes)
- [ ] buy it to graduation from two wallets, sell 30 % at once, watch the brake banner, redeem; every signature into `docs/launch-thread.md`
- [ ] X thread (`docs/launch-thread.md`), Dexscreener / Jupiter submissions (`before-mainnet.md` §5)

Mainnet record (fill in): deploy slot ______, config signature ______, first coin ______.
