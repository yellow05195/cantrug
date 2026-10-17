# @floored/indexer

Indexer for the FLOORED program (`E7ZbamLD8wenjjHitR8bUHwuNKA4Em39sqybnhk3nc87`). It decodes program events from transaction logs, keeps a Postgres projection of every coin (curve, pool, floor, brake), derives candles, floor snapshots and global stats, serves a public JSON API and pushes every event over a websocket.

Stack: Hono (+ `@hono/node-ws`), Drizzle ORM on `postgres`, zod, `@solana/web3.js`, pino, vitest.

## Run locally

```bash
cp .env.example .env               # then set HELIUS_WEBHOOK_SECRET
docker compose up db               # Postgres 16 on localhost:5432 (floored/floored)
pnpm install                       # from the repo root
pnpm --filter @floored/indexer db:migrate
pnpm --filter @floored/indexer dev # http://localhost:8787
```

Bootstrap or recover from the chain (devnet, or after downtime):

```bash
pnpm --filter @floored/indexer backfill                 # full history of the program
pnpm --filter @floored/indexer backfill --limit 5000 # newest 5000 signatures only
pnpm --filter @floored/indexer backfill --until <sig> --batch 20 --delay-ms 250
```

The backfill walks `getSignaturesForAddress(PROGRAM_ID)`, fetches the transactions with `getParsedTransactions` and feeds them, oldest first, through the same handler as the webhook. It is idempotent, so it can run while the webhook is live.

Other scripts: `build` (tsc to `dist/`), `start` (run `dist/index.js`), `test`, `typecheck`, `db:generate` (new drizzle-kit migration after editing `src/db/schema.ts`), `db:studio`.

### Environment

| Variable | Default | |
| --- | --- | --- |
| `DATABASE_URL` | required | Postgres URL |
| `RPC_URL` | `https://api.devnet.solana.com` | Used by backfill and the holders job only |
| `HELIUS_WEBHOOK_SECRET` | empty | The webhook's `Authorization` header must equal it. When it is empty, every call is rejected |
| `PORT` | `8787` | |
| `PROGRAM_ID` | `E7Zbam…nc87` | |
| `LOG_LEVEL` | `info` | pino level |
| `SLOT_TIME_MS` | `400` | Slot duration estimate for brake window ETAs |
| `SNAPSHOT_INTERVAL_MS` | `60000` | Floor snapshot job, `0` disables it |
| `HOLDERS_REFRESH_INTERVAL_MS` | `0` (off) | Holders refresher, see below |
| `HOLDERS_REFRESH_MAX_COINS` | `25` | Coins refreshed per run, most recently traded first |
| `FETCH_METADATA` | off | `1` fetches the coin's `uri` JSON for `image_url` / `description` |
| `CORS_ORIGIN` | `*` | |
| `STATS_DEBOUNCE_MS` | `2000` | Debounce of the global stats recompute |

## Helius webhook setup

Create a **raw** webhook on the program address. Helius sends `authHeader` back as the `Authorization` header:

```bash
curl -X POST "https://api.helius.xyz/v0/webhooks?api-key=$HELIUS_API_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "webhookURL": "https://indexer.example.com/webhooks/helius",
    "webhookType": "raw",
    "transactionTypes": ["Any"],
    "accountAddresses": ["E7ZbamLD8wenjjHitR8bUHwuNKA4Em39sqybnhk3nc87"],
    "authHeader": "<HELIUS_WEBHOOK_SECRET>"
  }'
```

Use `"webhookType": "rawDevnet"` for devnet. With the Helius CLI (`helius webhooks create`), use the same payload: type raw, account addresses `[PROGRAM_ID]`, auth header set to the secret.

How the webhook is processed:

- Each item is a raw transaction (`slot`, `blockTime`, `meta.logMessages`, `meta.err`, `transaction.signatures`).
- Items are sorted by slot. Each signature is applied in **one DB transaction**, with `processed_signatures` providing idempotency, so Helius retries and backfill overlaps are harmless.
- Failed transactions (`meta.err` set) are recorded and ignored.
- Only `Program data:` lines logged while the FLOORED program is the executing program are decoded. The decoder tracks the invoke stack, so a forged event printed by another program is ignored.
- A storage error returns 500 so Helius retries.
- Pre-upgrade events (devnet, before slot 512053014) use a shorter layout. The new fields are not all trailing (for example `Trade.tokens_sold` sits mid-struct), so a payload that doesn't match the current layout exactly is decoded again with the exact pre-upgrade layout (`ADDED_IN_V2` in `src/chain/layouts.ts`). Decoding stays strict: a payload that matches neither layout byte for byte is rejected. The absent fields are zero-filled by the decoder, then rebuilt by `src/domain/legacy.ts` before the reducer runs:
  - `timestamp` ← block time
  - `CoinCreated.supply` ← 1B tokens
  - `Trade.tokens_sold` ← `virtual_tok − token_reserves` on the curve, unchanged on the pool
  - `Redeemed.queued` ← `supply_after − pool_tok_after − circulating_after`
  - `QueueSettled.queued_after` ← previous queue minus `tokens_returned` for a cancel, unchanged otherwise
  - `QueueSettled.epoch` ← the coin's current epoch
  - `BrakeReleased.reason` ← 0 (the old program only released the brake from window fills)

  Each such signature is logged once at debug level. Rebuilt queue events keep a `legacy_missing` list in their `data`.

## Data model (`src/db/schema.ts`, migrations in `drizzle/`)

- Units:
  - On-chain amounts are `numeric(39,0)`, surfaced as bigint in code and as strings in JSON.
  - `coins.*_lamports_per_token` are lamports per whole token (10^6 base units).
  - Prices on `trades`, `candles` and `floor_snapshots` are SOL per token.
- `coins` is a pure projection of the latest event by slot; the row's state is overwritten only when `event.slot >= last_event_slot`. Counters (buys, sells, volume, redeemed SOL, engagements) are applied for every event, and their idempotency comes from the signature. The reducer is `src/domain/reducer.ts` and is pure.
  - Every state field is read straight from an event; nothing is derived from deltas or params:
    - `CoinCreated` gives `supply`.
    - `Trade` gives reserves, `real_sol`, `tokens_sold`, pool, `queued` and supply. In a sell, the user's Trade is emitted after `QueueJoined`, so its `queued` already includes the remainder.
    - `Graduated` gives the pool, `tokens_sold` and supply.
    - `Redeemed` gives the pool, supply and `queued`.
    - Queue events give the queue size after them: `QueueJoined.queued_total`, `QueueProcessed.queued_after`, `QueueSettled.queued_after` (so a cancel that empties the queue is visible), and `BrakeReleased` sets it to 0.
  - `brake_engaged` is `queued > 0`.
  - `BrakeReleased.reason` drives the epoch: 0 (served by a window fill) closes the epoch, so the coin moves to `epoch + 1`; 1 (last position cancelled or switched to the floor) keeps the epoch.
  - Every event has an on-chain `timestamp`, which is used as the event time; `blockTime` is only a fallback.
  - Volume is the sum of event `sol_amount` (fee-inclusive on buys), which matches on-chain `volume_sol`.
  - Price = `sol_reserves / token_reserves`: virtual reserves on the curve, pool reserves after graduation.
  - Floor after graduation = `pool_sol / (supply − pool_tok − queued)`.
  - Before graduation the stored floor is the preview `real_sol / tokens_sold`, and the API reports `floor_active: false`.
- `trades` has primary key `(signature, event_index)`. A single sell instruction can emit an aggregate queue fill and the user's trade, and `ix_index` is kept as well.
- `redeems` and `queue_events` (`joined | processed | settled | engaged | released`, plus the full payload in `data`).
- `candles` (1m / 5m / 1h) are updated on each trade. Open goes to the earliest slot and close to the latest, so late events are handled. Each candle has `floor_at_close`.
- `floor_snapshots`: unique `(mint, minute)`. They are written every 60 s for active coins (graduated, or traded in the last 24 h), and on every redeem and graduation.
- `holders` comes from the optional refresher.
- `global_stats` is a single row recomputed by debounced SQL aggregates after applied events.
  - `rugs_avoided` = brake episodes (from a `BrakeEngaged` to the next `BrakeReleased` of the same coin) whose peak queued amount reached 10 % of the coin's current supply.
- `processed_signatures`.

## API

All `GET /api/*` responses carry CORS headers and `Cache-Control: public, max-age=3, s-maxage=3, stale-while-revalidate=10`. Amounts come in pairs: `x` is the raw integer string and `x_display` is a lossy SOL or token number. Prices are objects `{ sol_per_token, lamports_per_token, lamports_per_base_unit, display }`. The full contract is in [`openapi.json`](./openapi.json).

| Endpoint | Description |
| --- | --- |
| `GET /health` | `{ ok, db, ws_clients }`. Returns 503 when the DB is down |
| `POST /webhooks/helius` | Helius raw webhook (see above) |
| `GET /ws` (websocket) | Every applied event is sent as `{type, mint, signature, slot, ts, data}`. Send `{"subscribe":"<mint>"}` (repeatable) or `{"subscribe":"*"}`, and `{"unsubscribe":"<mint>"}` to stop. A client with no subscription receives everything |
| `GET /api/coins?sort=new\|graduating\|floor\|volume&phase=curve\|graduated&limit&cursor` | Keyset-paginated list; pass back `next_cursor`. `graduating` = curve coins by `real_sol` desc |
| `GET /api/coins/:mint` | Full row, plus `price`, `floor` (after graduation) or `floor_preview` (before, with `floor_active: false`), `gap_bps` = (price − floor) / price, `graduation_progress_bps`, and `brake` (engaged, epoch, engagements, ref price, queued, `window` ETA computed from `brake_window_slots`, the last indexed slot and `SLOT_TIME_MS`) |
| `GET /api/coins/:mint/trades?limit&before` | Newest first. `before` is a slot or a signature; `next_before` paginates |
| `GET /api/coins/:mint/floor?from&to&interval` | Floor snapshots downsampled to `1m\|5m\|15m\|1h\|4h\|1d`. Default range is 24 h, maximum 31 days. `from` / `to` accept unix seconds, unix ms or ISO |
| `GET /api/coins/:mint/candles?interval=1m\|5m\|1h&from&to` | OHLCV in SOL per token, with `floor_at_close` for the floor line |
| `GET /api/coins/:mint/queue` | Brake state, per-wallet queue entries and the 50 latest queue events. Entries are pro-rata estimates replayed from queue events (events carry no shares or scale; the exact remainder is the on-chain `QueueEntry`) |
| `GET /api/coins/:mint/holders?limit` | Holders from the refresher, with share of supply and of circulation |
| `GET /api/stats` | Global stats plus `sol_redeemed_by_day` (90 days) |
| `GET /api/portfolio/:owner` | Coins the wallet traded or holds, valued at price and at floor (lamports) |

How portfolio balances are computed: from `holders` when the refresher has seen the wallet. Otherwise they are estimated as bought − sold − queued + cancelled-from-queue − redeemed. Token transfers are not visible to this estimate.

## Holders refresher (optional)

Enable it with `HOLDERS_REFRESH_INTERVAL_MS`, for example `300000`. For each coin it calls:

1. `getProgramAccounts(Token program, dataSize 165, memcmp(mint at offset 0))` with a 40-byte `dataSlice`. This is exact.
2. If the RPC refuses, a fallback of `getTokenLargestAccounts` (top 20 only) plus the owners of those accounts.

Vault accounts owned by the coin PDA are excluded.

Rate-limit caveats:

- `getProgramAccounts` on the Token program is heavy. Public and free RPCs often disable or throttle it, and the job then degrades to the top-20 fallback.
- The job processes one coin at a time with a 1.5 s pause. Keep `HOLDERS_REFRESH_MAX_COINS` small and the interval at several minutes on shared RPCs.
- A paid RPC, or a Helius DAS/`getTokenAccounts` integration, is recommended at scale.

The webhook path never depends on this job.

## Code layout

```
src/
  chain/      borsh reader/writer, IDL layouts, event + CoinState decoders (swappable for @floored/sdk)
  domain/     pure logic: math (exact bigint floor/price/gap), reducer, legacy-event completion, candles, queue replay, snapshots
  db/         drizzle schema, client, migrate script
  repo/       store interfaces, Postgres (drizzle) and in-memory implementations
  ingest/     transaction handler, Helius payload + auth, ingestor (post-commit hooks), websocket hub
  jobs/       snapshots, holders, metadata, debounce
  api/        read routes and serializers
  app.ts      Hono app factory (testable without a DB)
  index.ts    server entry
  backfill.ts CLI
test/         vitest suites (no DB): decoding vs an encoder, IDL layout parity, pre-upgrade layouts, reducer, candles, gap_bps, webhook auth/ingestion
```
