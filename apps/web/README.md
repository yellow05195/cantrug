# @floored/web

The FLOORED front end: Next.js 16 (App Router), React 19, Tailwind v4, `@floored/sdk`.
Design contract: [`DESIGN.md`](../../DESIGN.md) at the repo root.

## Scripts

```bash
pnpm install                                   # at the repo root
pnpm --filter @floored/web dev                 # http://localhost:3000
pnpm --filter @floored/web build
pnpm --filter @floored/web lint
pnpm --filter @floored/web typecheck
```

If pnpm complains about `allowBuilds` / verify-deps, prefix with `pnpm --config.verify-deps-before-run=false`.

## Environment

Copy `.env.example` to `.env.local`.

| variable | default | what it does |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | empty | Indexer origin (`apps/indexer`). REST under `/api`, websocket at `/ws`. |
| `NEXT_PUBLIC_MOCK` | `1` when no API URL | `1`: mock mode. `0`: live (indexer if set, else RPC only). |
| `NEXT_PUBLIC_RPC_URL` | `https://api.devnet.solana.com` | On-chain reads, simulation, sending. |
| `NEXT_PUBLIC_CLUSTER` | inferred from the RPC URL | Explorer links (`?cluster=devnet`) and the "devnet" header tag. |
| `NEXT_PUBLIC_UPLOAD_URL` | empty | Image + metadata uploader (POST multipart `file`, returns `{ "url" }`). Without it a dev stub returns data URLs, which only work in mock mode (on-chain URIs are capped at 200 bytes). |
| `NEXT_PUBLIC_CHALLENGE_MINT` | `7Pwq…YVY` (FLRD on devnet) | Coin replayed on `/challenge`. |
| `NEXT_PUBLIC_CHALLENGE_DEV` | `5rA2…7evE` | Its dev wallet (the dump is looked up from this wallet's history). |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | Absolute URLs for OG images. |

## Three data modes

| | lists, feed, candles, stats | coin state, quotes, bag value | transactions | live updates |
|---|---|---|---|---|
| **mock** (`NEXT_PUBLIC_MOCK=1`) | in-memory dataset (`src/lib/mock`), 12 coins replayed through the SDK math | the same dataset, as SDK `CoinState` | simulated with the SDK on a copy, applied on confirm; "Demo wallet" in the wallet picker | mock websocket: a trade every 2 to 5 s, the crank serves brake queues every window |
| **live + indexer** | `NEXT_PUBLIC_API_URL` | RPC (`getMultipleAccounts`: CoinState, mint, ATA, QueueEntry) | SDK builder → compute budget → `simulateTransaction` → `parseEvents` → confirm dialog → wallet signs → confirm → toast | indexer `/ws` |
| **live, RPC only** (`MOCK=0`, no API URL) | lists empty; coin feed and the challenge read program events from the RPC | RPC | as above | RPC re-reads every 12 s |

The coin page never needs the indexer for numbers that matter: the Redeem quote, "Your bag is worth at least X SOL", the brake banner and the floor line come from `CoinState` + mint supply read directly (`src/lib/chain`). Without candle history the chart draws the floor at its current level.

## Layout

```
src/app            routes: / , /coin/[mint], /create, /portfolio, /how-it-works, /stats, /challenge, /api/og/[mint]
src/components     ui/ (Button, Num/Price, NumRoll, FloorBadge, GapMeter, LevelRule, Tabs, Dialog, Toaster…), coin/, home/, create/, portfolio/, how/, stats/, challenge/, layout/, wallet/
src/lib/api        types.ts (indexer JSON), client.ts (REST + mock switch), ws.ts (live + mock stream)
src/lib/chain      RPC reads, Metaplex metadata, positions, history from program events, mock chain
src/lib/tx         live.ts (simulate-then-sign), mock.ts, errors.ts (IDL codes → sentences), TxProvider (confirm dialog + toasts)
src/lib/mock       engine (program replay on SDK math), dataset, serializers, in-process API
messages/          en.json, fr.json (next-intl, cookie NEXT_LOCALE)
```

Motion (GSAP via `useGSAP`, all behind `prefers-reduced-motion`): the floor line pours in on first paint, split-flap counters (`NumRoll`), the brake banner slide and shiver. Theme: dark by default, `data-theme="light"` ("béton clair"), cookie `floored-theme`.
