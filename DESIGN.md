# FLOORED, design system

Direction (from the brief, followed exactly): **concrete and the floor line**. Every coin is a building; the floor is its load-bearing slab. The site must read like a construction document: raw, exact, orange safety light on dark concrete. Trenchers must find their way around in two seconds (feed, coin page, create button, the Pump muscle memory), and FLOORED must look ten times more solid than Pump.

Design read: *crypto trading product for trenchers and the people who got rugged by trenches, with an industrial-document language (Teenage Engineering rigor, Nothing's one-accent discipline, Linear/Vercel hierarchy, Hyperliquid clarity).* Dials: variance 6, motion 4, density 6 (trading UI, numbers must breathe but stay dense).

## 1. Tokens

### Color (CSS variables on `:root`, dark is the default theme; the optional light theme is "béton clair")

| token | dark | light ("béton clair") | role |
|---|---|---|---|
| `--bg` | `#141414` | `#E9E6E0` | page background, raw slab |
| `--bg-2` | `#1C1C1B` | `#F2F0EB` | panels, cards, chart background |
| `--bg-3` | `#242423` | `#DDD9D1` | hover rows, inputs |
| `--line` | `#2E2E2C` | `#CFCAC0` | 1 px rules (architect lines) |
| `--line-2` | `#3A3A38` | `#B9B3A8` | emphasized rules, input borders |
| `--ink` | `#EDEBE6` | `#171716` | primary text (off-white / off-black) |
| `--ink-2` | `#A5A29B` | `#5B5955` | secondary text |
| `--ink-3` | `#8C8982` | `#64615B` | tertiary, placeholders (lifted from the first draft for WCAG AA on small text) |
| `--floor` | `#FF5F1F` | `#B83F0A` | **the only accent**: the floor line, floor numbers, the Redeem button, focus rings (light value darkened so orange text and the white label on orange pass AA) |
| `--floor-ink` | `#141414` | `#FFFFFF` | text on an orange fill |
| `--floor-dim` | `rgba(255,95,31,.14)` | `rgba(232,80,15,.12)` | floor fills under the line, badges |
| `--brake` | `#FFD400` | `#F2C800` | brake only (banner stripes, countdown) |
| `--brake-ink` | `#111111` | `#111111` | text on yellow |
| `--up` | `#6FA287` | `#3E7A5A` | desaturated candle green |
| `--down` | `#B5635C` | `#9A4A43` | desaturated candle red |

Rules: orange is reserved for the floor family (line, floor values, "Redeem at floor" actions, the live counter). Never use orange for generic buttons, links, or decoration. Yellow + black stripes appear only when the brake is engaged. Green/red appear only on price deltas and candles, never as CTA colors. Nothing is pure black or pure white.

### Typography

- Display and UI: **Inter Tight** (next/font/google), weights 500/600/700, tight tracking on display (`letter-spacing: -0.02em` at ≥ 32 px, `-0.01em` at 20–32 px). Headlines are sentence case.
- Numbers, tickers, addresses, code: **JetBrains Mono** (next/font/google), weights 400/500, `font-variant-numeric: tabular-nums` everywhere a number can change. All prices, floors, SOL amounts, percentages, countdowns, addresses, and the hero counter are mono.
- Scale (rem): 0.75 / 0.8125 / 0.875 / 1 / 1.125 / 1.375 / 1.75 / 2.25 / 3 / 4.5 (hero counter can go to 6 on desktop). Line-height 1.15 for display, 1.5 for body. Body measure ≤ 70 ch.
- No all-caps labels. Small labels are 0.75–0.8125 rem, `--ink-2`, sentence case. Exception: tickers ($FLR) are what they are.
- Level marks: a tiny decorative vocabulary borrowed from site plans, used sparingly and only where it encodes meaning: `±0.00` next to the floor line label on charts, a short horizontal tick + value for the floor on axes, a dimension line (`|——|`) only in the "How it works" diagrams.

### Shape, space, surface

- Radius: **2 px on everything** (inputs, buttons, cards, badges). Right angles like a plan. No pills.
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 px. Page gutters 16 px on mobile, 24 px tablet, 32 px desktop; max content width 1280 px; coin page can go to 1440 px.
- Surfaces are flat. Hierarchy comes from 1 px `--line` rules and background steps (`--bg` → `--bg-2` → `--bg-3`), never from drop shadows. One exception: floating layers (menus, dialogs, the wallet sheet) get `0 24px 48px -24px rgba(0,0,0,.6)`.
- Concrete grain: a fixed, `pointer-events-none`, full-viewport pseudo-element with an SVG `feTurbulence` noise at 4–6 % opacity (dark) / 8 % (light), mix-blend `overlay`. Never grain on scrolling containers. Optional faint formwork joints: 1 px `--line` vertical rules at the content container edges on the home page only (they are the grid, not decoration).
- Icons: `@phosphor-icons/react`, weight `regular`, 1.5 stroke feel, 16/20 px. One family.

### Motion (GSAP for the signature moments, CSS transitions for the rest; everything behind `prefers-reduced-motion`)

1. **The floor line pours in**: on a chart's first paint, the orange floor line draws left to right over 900 ms, `power2.out`, then the fill under it fades in over 300 ms. Once per mount.
2. **Mechanical counters**: the "SOL returned to holders" counter and the floor value on a coin page tick like a split-flap: digits roll vertically (`y` transform per digit, 240 ms, `power3.out`), only the digits that changed.
3. **Brake banner**: slides down from under the header (translateY −100 % → 0, 320 ms, `power3.out`) with a 2-frame 1 px horizontal shiver at the end; the yellow/black stripes scroll very slowly (40 s per loop) while engaged. Leaves with a 200 ms slide up.
4. Buttons: `:active` scale 0.98; transitions 160 ms `cubic-bezier(.2,.7,.2,1)`. No hover lifts, no glows.
5. Live rows (trades feed): new row enters with a 160 ms background flash of `--bg-3`, no slide.
Everything else is static. Reduced motion: counters jump, lines appear, banner appears, stripes freeze.

## 2. Components (apps/web/src/components/ui unless noted)

- `Button`: variants `floor` (orange fill, `--floor-ink` text; only for Redeem/"Exit at floor"), `primary` (ink fill, bg text; Buy, Launch a coin), `secondary` (1 px `--line-2`, ink text; Sell, Cancel), `ghost`. Sizes sm/md/lg. Mono for amounts inside buttons. Loading state replaces the label with a 3-dash mechanical indicator, never a spinner.
- `Num`: mono tabular number with optional unit; `NumRoll` the split-flap variant.
- `FloorBadge`: `±0.00`-style chip: orange text on `--floor-dim`, shows floor value or "Floor active at graduation" on curve coins.
- `GapMeter`: price vs floor as a thin horizontal rule with two ticks (floor at left origin in orange, price tick in ink) and the text "34 % above the floor"; the orange segment is the guaranteed part of the price.
- `CoinCard`: name, ticker, image (56 px square, 2 px radius), price, mcap, floor (orange), gap meter, phase tag (curve progress bar in ink; graduated shows the floor). Clickable whole card, 1 px `--line` border, hover `--bg-3`.
- `Chart` (`lightweight-charts`): candles with desaturated colors, **floor line as a thick (3 px) orange line series under the candles**, with a soft `--floor-dim` area fill from the floor down to the axis; a last-price line in ink; crosshair; interval tabs 1m/5m/1h. Axis labels mono. Chart background `--bg-2`, grid `--line` at 50 % opacity.
- `TradePanel`: tabs Buy / Sell / **Redeem at floor**. Amount input (mono, large), quick fractions (25/50/75/100 % for sell/redeem; 0.1/0.5/1/5 SOL for buy), live quote lines ("You receive 0.4812 SOL", "Floor share 0.4788 SOL, 0.5 % stays in the pool", "Brake: 61 % executes now, rest queued"), slippage setting in a small disclosure, the simulate-then-sign summary dialog ("You receive X SOL. Confirm in Phantom."). The Redeem tab is the only orange surface on the page besides the chart line.
- `BagFloorBox`: "Your bag is worth at least X SOL" in orange, with the market value next to it in ink, for the connected wallet.
- `BrakeBanner`: full-width band under the header: diagonal yellow/black 45° stripes 12 px wide as a 6 px top border, yellow background block with black mono text: "Brake engaged. Window closes in 0:42. 18.4M tokens queued (2.1 % of supply). Sells are being served pro rata." Right side: button `floor` "Exit now at floor" (queue_to_redeem or redeem). On mobile stacks.
- `QueuePanel`: your queue position (tokens left, SOL earned, buttons Claim / Cancel / Switch to floor) and the public queue (total queued, filled this window, windows processed).
- `TradesFeed`: dense rows, mono, side glyph (▲ buy in `--up`, ▼ sell in `--down`, ● queue fill in `--ink-2`, ◆ redeem in orange), amount SOL, tokens, wallet short, age. Virtualized above 200 rows.
- `Holders`: top holders table with % and value at floor.
- `LevelRule`: the horizontal section rule with a small `±0.00` label; used at most twice per page.
- `LangToggle`: EN / FR text toggle in the header (next-intl, cookie-persisted). `ThemeToggle`: dark / "béton clair".
- `WalletButton`: wallet-adapter modal restyled to tokens (Phantom, Solflare, Backpack, Seeker via Mobile Wallet Adapter).

## 3. Pages and layout

Header (64 px, sticky, `--bg` with 1 px bottom rule): logo (F on its orange slab, 24 px) + "FLOORED"; nav: Coins, Create, Portfolio, How it works, Stats; right: SOL returned mini-counter (mono, orange digits) on ≥ lg, language toggle, theme toggle, wallet button. On mobile: logo, wallet, menu button; nav in a bottom sheet.

### Home `/`
Hero, left-aligned, not centered, two columns on desktop (7/5):
- Left: headline "Pump burns your dead money. We give it back." (FR: "Pump brûle ton argent mort. Nous, on te le rend."), one paragraph ≤ 20 words: "Every FLOORED coin has a floor: the pool's SOL belongs to holders, redeemable any time. And no sale can crash it." Buttons: primary "Launch a coin", secondary "See the coins".
- Right: the giant counter "SOL returned to holders" (NumRoll, 4.5–6 rem, orange digits, mono), under it two small lines: coins launched, brakes engaged. Below the counter on desktop sits the hero image (`/assets/hero-slab.png`, generated: concrete slab seen from below with an orange light line) cropped in a 16/9 frame; on mobile the image goes under the headline.
Then three live columns on one row (stack on mobile): **New**, **About to graduate**, **Highest floor**; each a list of 6 `CoinCard`s with a "See all" link. Then a short "How the floor works" strip with 3 one-line facts and a link. Footer: program id with copy button, "Verify the floor yourself" link, X, GitHub, docs, language.

### Coin `/coin/[mint]`
Desktop 12-col: left 8 = header row (image, name, ticker, creator short + age, phase + curve progress or graduated date, socials), `BrakeBanner` when engaged (above everything, full width), `Chart` (520 px tall), tabs under the chart: Trades / Holders / Queue / About; right 4 (sticky) = `TradePanel`, `BagFloorBox`, key numbers (price, floor, gap, mcap, pool SOL, circulating, 24 h volume, SOL returned on this coin). Mobile: header, banner, chart (360 px), key numbers row (horizontal scroll), trade panel, tabs. The floor value on this page is live (websocket) and rolls.

### Create `/create`
Two columns (form 7, preview 5 sticky). Fields: name, ticker, image (drop zone, square crop preview), description, website, X, Telegram; optional first buy in SOL with the live quote "You get ≈ 34.6M tokens (3.46 % of supply)". The preview is the exact `CoinCard` + a mini chart frame showing where the floor will start ("Floor active at graduation, starts at the average price paid"). Fees shown plainly: "Creation costs 0.02 SOL + network fees. Trade fee 1 % (0.4 % to you as creator)". Button primary "Launch coin"; after success, a dialog with the mint, links, and "Share" kit download link.

### Portfolio `/portfolio`
Table of your FLOORED coins: coin, balance, value at price, **value at floor** (orange, labelled "guaranteed by the pool"), gap, queue position if any; totals row; button `floor` "Redeem everything at floor" (builds one tx per coin, shows the total SOL you'd receive). Empty state: "No FLOORED coins in this wallet yet. Buy one, or launch yours." with the two buttons.

### How it works `/how-it-works`
Editorial, single column 70 ch, Stripe Press quality. Sections: The problem (dead liquidity, Pump burns it); The floor (diagram 1, animated: pool SOL ÷ circulating supply, a holder redeems, the slab stays level); The brake (diagram 2: a −90 % candle hitting the slab and being split into −20 % steps served pro rata); FLOORED vs Pump (diagram 3, side by side: what happens to the last 20 %); Verify it yourself (the formulas in mono, the three account addresses to read, a "Read on-chain now" widget that fetches the live state of any coin and recomputes the floor in the browser); Fees; FAQ. Illustrations from `/assets/howitworks-*.png` (generated). Formulas visible: `floor = S / C`, `C = supply − T − Q`, `redeem(x) = S·x/C − 0.5 %`, `brake: price ≥ 0.8 × price_window_start`.

### Stats `/stats`
Four big numbers (SOL returned, coins launched, brakes engaged, rugs avoided = brake engagements where ≥ 10 % of supply was queued), a line chart of SOL returned per day (floor-orange line), tables: top coins by floor, biggest single redeem, most braked coins.

### Rug-proof challenge `/challenge`
A replay page: the demo coin's recorded dump: a 30 % sell at T0, the brake banner, the price staircase (each step ≤ 20 %), the floor line never moving, and the "redeem instead" counterfactual. Pulls the real devnet trades of the demo coin through the API.

## 4. Copy rules

English default, French toggle (messages in `apps/web/messages/en.json` and `fr.json`). Plain verbs, sentence case. The product words are fixed and used identically everywhere: **the floor**, **redeem at floor**, **the brake**, **queued**, **window**, **pool**, **circulating**. Buttons say what happens: "Buy", "Sell", "Redeem at floor", "Launch coin", "Exit now at floor", "Claim earned SOL", "Cancel queue". Messages after an action reuse the verb: "Redeemed 0.481 SOL". Errors are specific: "Brake active: 61 % of this sale executes now, 39 % would be queued. Continue?". No em dashes. No exclamation marks.

Honesty rule for copy: the floor is a current, verifiable minimum, not a promise of future value. Market sells above the floor lower it slightly for the others; buys and every fee raise it. Say "every trade feeds the floor" (true: 0.2 % of every pool trade stays in the pool), not "every trade raises the floor".

## 5. Logo

A heavy sans "F" (Inter Tight 800, optical corrections in SVG) standing on a thick orange slab 1/5 of the cap height, the slab wider than the letter by one stem on each side. Monochrome ink on dark, slab orange. Favicon: the F and slab at 16 px (slab 3 px). Avatar: F on slab centered on `--bg`. Banner (1500×500): the wordmark FLOORED with the slab running under all letters, the tagline at right in mono.
