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


---

# v2: "chantier vivant", cartoon-pro

Second pass, asked after the first build: the site must feel **alive** and **beautiful**, in the energy of a fomo/degen launchpad, a little **cartoon** but executed like a pro product, with real **transitions**, and clearly **organised**. The DA stays: concrete, one safety-orange accent, yellow/black only for the brake. What changes is the material (stickers on wet concrete instead of an architect's plan), the shapes, and the amount of motion. Everything below overrides section 1 where they disagree; sections 2 to 5 stay valid unless restated.

## Concept

A construction site at night. The slab is poured, the orange laser is on, and the site is busy: trucks, lights, people shouting numbers. Every coin is a **building** (the lore): a small cartoon building silhouette generated from its mint is its default avatar, standing on an orange slab. UI elements are **stickers and signs** stuck on the concrete: thick strokes, rounded corners, a solid offset shadow that makes them look cut out of thick vinyl. Numbers stay mono and exact; the cartoon lives in the shapes, the avatars and the motion, never in the data.

## Tokens v2

Colors (dark default; light "béton clair" keeps its v1 values with the same deltas):

| token | value | role |
|---|---|---|
| `--bg` | `#141414` | page |
| `--bg-2` | `#1C1C1B` | panels |
| `--bg-3` | `#262624` | raised rows, inputs |
| `--surface` | `#2A2A28` | sticker/card fill |
| `--stroke` | `#3A3A38` | 2 px sticker stroke |
| `--stroke-strong` | `#56544F` | hovered stroke, dividers that matter |
| `--shadow` | `#0A0A0A` | the solid offset shadow under stickers |
| `--ink` | `#F2EFE9` | text |
| `--ink-2` | `#B3AFA6` | secondary |
| `--ink-3` | `#8C8982` | tertiary |
| `--floor` | `#FF5F1F` | the accent: floor line, floor numbers, Redeem, and in v2 the primary CTA too (the only orange button besides Redeem) |
| `--floor-hot` | `#FF7A3D` | hover of orange elements, glow |
| `--floor-deep` | `#B8400E` | offset shadow under orange stickers |
| `--floor-dim` | `rgba(255,95,31,.16)` | fills |
| `--brake` / `--brake-ink` | `#FFD400` / `#111111` | brake only |
| `--up` / `--down` | `#5FBF8A` / `#E0605A` | price moves and candles (a notch more saturated than v1 so the feed feels alive) |

Still one accent. Green and red appear only on price data. No gradients except the glow under the hero slab image.

Shape: **radius 12 px** on cards and panels, **10 px** on buttons and inputs, **999** on tags and chips (one documented rule). **2 px strokes** on every sticker. **Slab shadow**: `box-shadow: 0 4px 0 0 var(--shadow)` on cards and buttons (orange buttons use `--floor-deep`); hover lifts the element 2 px and the shadow grows to 6 px; press pushes it down 2 px and the shadow shrinks to 2 px (tactile, 100 ms). Surfaces are still matte: no blur, no glass, no soft drop shadows anywhere.

Type: Inter Tight **800** for display at `-0.03em`, sizes one step bigger than v1 (hero 3.5 rem mobile / 5.5 rem desktop); 600 for UI; JetBrains Mono for every number, tabular. Headlines stay sentence case; tickers stay as they are.

Icons: Phosphor **duotone** weight, duotone color = `--floor` at 40 %, for the cartoon feel; 20 px in UI, 32 px in sticker cards.

Grain: keep the fixed noise overlay at 5 %. Add the formwork joints as 1 px `--stroke` vertical rules only on the home hero.

## Coin avatars

`BuildingAvatar(mint, size)`: a deterministic flat cartoon building from the mint hash: 1 to 3 stacked blocks, a roof shape (flat, saw-tooth, antenna, water tank), 2 to 6 lit windows (orange), palette from four concrete greys plus `--floor` for lights, all standing on a 3 px orange slab. Square, 12 px radius, `--stroke` border. Used wherever a coin has no image, and as the mark on OG images. Coins with an image get the image inside the same sticker frame with the slab under it.

## Motion v2 (vivid, but each one has a job)

Rules from the animation skill apply: transform and opacity only, `--ease-out: cubic-bezier(.23,1,.32,1)` for entrances, `--ease-in-out: cubic-bezier(.77,0,.175,1)` for on-screen movement, UI under 300 ms, hover gated by `(hover: hover) and (pointer: fine)`, `prefers-reduced-motion` keeps opacity only.

1. **Route transitions** (purpose: continuity): `app/template.tsx` fades and rises the page content 220 ms `--ease-out` with `@starting-style`; the coin avatar and name carry `view-transition-name: coin-<mint>` so card to coin page morphs where the View Transitions API exists (Chrome), degrades to the fade elsewhere. Back navigation reverses.
2. **Hero entrance** (once per session, explanation tier): headline lines rise 12 px and fade with a 60 ms stagger, the counter pours in (split-flap), the orange line of the slab image "ignites" with a 600 ms opacity sweep. 1.1 s total, nothing blocks interaction.
3. **Live ticker** (state indication): one marquee under the header showing the last trades across all coins (avatar, ticker, up/down amount, age), `linear` 45 s per loop, pauses on hover, new items enter at the left edge with a 160 ms slide. This is the single marquee of the site.
4. **Feeds** (preventing jarring changes): new trade rows enter with `translateY(-100%)` to 0 over 160 ms `--ease-out`, background flashes `--up`/`--down` at 20 % for 300 ms; numbers that change (price, floor, counter) flash their color 150 ms and roll (split-flap) only in the hero and the coin header.
5. **Stickers** (feedback): hover lift 2 px / shadow 6 px in 160 ms `--ease-out`; press 100 ms; cards in the three home columns stagger 50 ms on first paint only.
6. **Brake banner** (state): slides down 320 ms `--ease-out`, then a 2-frame 1 px shiver; stripes crawl `linear` 40 s while engaged; exits in 200 ms upward.
7. **The slab lands** (delight, rare): when a coin graduates while you are on its page, or right after a successful `create_coin`, a one-time 900 ms sequence: a concrete dust puff (8 particles, opacity and transform), the floor line draws from left to right, the floor value pours in. Plays once per coin per session.
8. **King of the hill** (marketing only): the spotlight card on the home page breathes: a 4 s `ease-in-out` opacity loop on its orange glow. Off under reduced motion.
9. **Chart**: floor pour on first paint (v1). Candle updates are not animated (data).

Tooling: CSS first (`@starting-style`, transitions), GSAP only for the three sequences (hero, slab lands, split-flap). Nothing on keyboard-driven actions.

## Organisation

Header (64 px, sticky, sticker bottom edge): mark + FLOORED, nav Coins / Create / Portfolio / How it works / Stats, right: live SOL-returned counter (lg and up), EN/FR, theme, wallet. Under it, the live ticker (36 px, hidden below md, collapses to a "live" chip that opens the feed).

### Home
1. **Hero** (compact, one viewport): the slab image as a full-width background crop behind a left-aligned sticker block: headline, one line, two buttons (orange "Launch a coin", stroke "See the coins"); the giant counter sits top-right on desktop and under the headline on mobile. Formwork joint rules frame the content.
2. **Hot right now**: one spotlight sticker (king of the hill): the coin with the most SOL traded in the last hour, with a mini chart, floor badge, gap meter and a "Trade" button; three small chips at its right: biggest floor jump, newest graduate, most braked.
3. **Live columns**: New / About to graduate / Highest floor, as three columns on desktop and as chunky pill tabs on mobile; each row is a sticker card with the building avatar.
4. **How the floor works**: three sticker cards with duotone icons (The floor, The brake, Verify it yourself), the single card grid of the page; each links to the matching section of How it works.
5. **Numbers strip**: SOL returned, coins launched, brakes engaged, rugs avoided, mono, with the floor-orange line under it.
6. Footer.

### Coin page
Same grid as v1 (8 / 4, sticky right column), every block a sticker card: header card (avatar, name, ticker, creator, phase pill, socials), brake banner above everything when engaged, chart card with chunky interval pills, tabs as pills (Trades / Holders / Queue / About), trade panel card with the three big tabs (Buy / Sell / **Redeem at floor**, the last one orange when active), the bag-floor box, key numbers in a 2-column mono grid. Mobile: bottom trade bar as a sticker, sheet with a slab-shadow handle.

### Create
Two columns; the preview column shows the live sticker card and the building avatar morphing as the ticker changes (seeded by the typed ticker until an image is uploaded). Success: the slab-lands sequence in the dialog, then share kit links.

### Portfolio, Stats, How it works, Challenge
Keep v1 structure; restyle as stickers; How it works keeps its editorial measure with the three illustrations in sticker frames; Stats uses four big sticker tiles and the orange line chart; Challenge keeps the replay with the brake banner.

## What stays forbidden
Gradient buttons, glass panels, soft shadows, purple anything, confetti outside the two delight moments, more than one marquee, animated numbers in tables, em dashes, all-caps labels, three identical feature cards anywhere except the "How the floor works" trio.

---

# v3: drawn, not photographed

After the v2 pass the user found the generated photos odd and the result generic. Rule from now on: **no raster imagery anywhere**. The site draws its own world with the drafting vocabulary already in the brand: a dot grid like drafting paper, the orange floor line as a page-wide datum with a ruler of ticks above it and the level mark ±0.00 at its left end, thin dimension lines with mono labels, hazard ledges for the brake, board-formed concrete rendered as flat fills with tie holes, and the building avatars. Photos and renders (hero slab, explainer illustrations, kit background, OG background) are removed from the app; the Higgsfield files stay in assets/ for social posts only.

Homepage, as built: a compact hero (kicker, headline, lede, two buttons) with the CrashScene drawing at its right (the price climbs, breaks, falls in brake steps onto the slab, dust, a live marker; drawn once per session), the datum under it with the live SOL-returned counter standing on the line and the three counts; "Hot right now" spotlight; the board (one dense list with New / Graduating / Highest floor / All tabs and real column headers) instead of three identical card columns; the blueprint strip (three columns separated by rules, drawn diagrams, formula in mono, 01 02 03 numbering because it is a sequence of reading); a closing band on the drafting grid. Stickers are kept for interactive surfaces only; inside a sticker, rows and hairlines, never another sticker.

## v3 calm pass (same day)

The user found the result "messy and AI-looking". Corrections, now the rule: surfaces are flat with 1 px hairline strokes, no offset shadows except a 2 px underline on buttons; no dot grid, no ruler ticks, no formwork joints, no ±0.00 captions, no kicker label, no 01/02/03 numbering, no breathing rings, no duotone icons (regular weight only), no chips used as decoration. The orange floor line (2 px, full width) is the single graphic emphasis of a page; the CrashScene keeps only the line, the yellow ledges, the slab and the live marker. Headlines are bold, not extrabold, one size down from v2. If a decoration cannot be explained in one sentence as information, it goes.

## v4 night (house style)

The user's verdict on v1 to v3 was that they were ugly whatever the pass, and
that the projects they had shown earlier (PAWNED, Quantum Heist) looked right
precisely because they were sober. v4 adopts that house style wholesale and
keeps only FLOORED's vocabulary (the floor, the brake, the receipt).

**Surface.** One dark theme, no toggle. Background `#05070f` with two radial
glow pools (orange top-left, blue bottom-right) and a fixed canvas of twinkling
stars with a few drifting construction objects kept in the gutters (`Deco`).
Content sits on nothing; plates (`plate`) appear only where there is product UI
to hold: the receipt, the board, tables, forms. A plate is a 1 px hairline
(`rgba(255,255,255,.07)`), a top-to-transparent 4 % white wash, an inset top
highlight and a 20 to 24 px radius. No offset shadows, no stickers, no rulers,
no grids except the faint drafting grid behind the hero.

**Type.** Plus Jakarta Sans 800 for display, letter-spacing −0.04 em, line
height 1.0 to 1.05; Jakarta 500 to 600 for text; Geist Mono for every number
and for the one label the house style allows, the mono uppercase `kicker`.
h1 clamps 42 to 80 px, h2 30 to 46 px.

**Colour.** Orange `#ff5f1f` is the floor and the primary action, nothing
else. `--up` green and `--down` red only on deltas. Ink `#f4f6ff`, muted ink
`#a2aac6`, faint ink `#737c9b`.

**Chrome.** Floating capsule header (blurred pill, hairline, pointer-events
only on the pill), pill nav with an ink-on-paper active state, pill buttons
with a 14 px radius and an inner highlight on the primary. Footer stands on a
bottom glow.

**Home.** Hero split 1.05/0.95: kicker, two-line headline (second line orange
with a soft glow), lede, two pills; on the right the redeem receipt plate,
tilting under the pointer, with three floating badges. Under it the floor
itself: a glowing 2 px line and a dark ground carrying four facts. Then the
board (kicker + live ticker + Board), and four editorial sections in a 5/7
grid with the sticky title on the left: the problem (two hairline rows and a
punchline), three guarantees (01/02/03 rows with a drawn mark each),
the math (prose and one table plate), FAQ (`details` rows), launch.

**Motion.** Hero lines rise once with a 60 ms stagger; sections reveal once on
scroll (`Reveal`, 600 ms, strong ease-out); badges float slowly; buttons press
to 0.97. Everything is off under `prefers-reduced-motion`.

## v5 flat (sober, square, photographs)

The user's verdict on v4: still too "AI". The glow pools, the starfield, the
pills, the floating badges and the tilting receipt all read as generated.
v5 removes every one of them and keeps the bones.

**Surface.** Graphite, not navy: `#0b0c0e` ground, `#141619` cards,
solid hairlines `#24282e` and `#363c44`. No gradient, no glow, no shadow,
no blur except under the sticky header. Every radius is 2 px. Grids are
drawn with 1 px gaps on a hairline background; product UI sits in a plain
bordered box; everything else is rows.

**Type.** Geist 400 for text, 600 for headings at −0.03 em, Geist Mono
for numbers and the one mono kicker. h1 clamps 38 to 68 px.

**Colour.** Orange only for the floor line, the floor numbers and the
primary button. Up and down greens and reds only on deltas.

**Photographs.** Real concrete architecture (Unsplash, free licence,
served from their CDN) in square frames with one hairline, shown in
grayscale with a touch more contrast so the only colour on a page stays
orange. Slots live in `src/lib/images.ts`: hero (cantilevered slab),
curve (ramp), floor (block on the ground), brake (wide staircase), vault
(sealed monolith), horizon (closing band), dark (challenge). The studio
renders described in `assets/README.md` replace them slot by slot once
generated; the component does not change.

**Home.** Hero split: words left with four live numbers in a 1 px grid
under them, one 4:5 photograph right with a caption bar. Then: how a coin
lives (three steps, three photographs, a formula each), the comparison
table against Pump.fun and a classic DEX pool, the math (prose, the
receipt as a list, the before/after table), the board, built to be
checked (photograph + six verifiable facts + program id), FAQ, and the
closing band (photograph + one sentence).

**Motion.** Sections reveal once on scroll with an 8 px rise; buttons
press to 0.985. Nothing else moves.

## v7 atelier (Plush Pons craft on the PAWNED skeleton)

The user asked for the look of their old project Plush Pons, "énormément".
Everything below is taken from it and translated into FLOORED's material.

**Two themes.** Day by default: warm plaster `#f3ede3` with a fixed felt
grain, espresso ink, cocoa secondary ink. Night with the toggle: the PAWNED
blue-night palette. The choice is remembered in localStorage and applied
before first paint. Orange stays the only accent in both.

**Surfaces.** The patch card: 22 px radius, a 2 px chalk-dashed seam set
7 px inside the edge, a soft warm shadow. Every product panel, table and
FAQ item is one. Plain cards without the seam for feature cards; frosted
glass cards over the drawn scenes; wells for inset panels.

**Type.** Fredoka 600 for every heading, Inter for text, JetBrains Mono for
numbers, chips and the kicker (uppercase, 0.2 em tracking).

**Scenes.** Drawn pixel art, no raster: a city of floors where every
building stands on a poured slab whose edge is the orange floor line,
cranes behind, plaster sky by day, star field by night. `lib/art/scene.ts`,
deterministic from a seed, served as an SVG data URI and shown crisp with
`image-rendering: pixelated`. One wide scene in the hero banner, one on top
of each feature card, one in the closing banner, a small one in the footer.

**Home.** Banner hero (scene, the redeem receipt standing in it, frosted
card with the words), chips row and a mono status line with the live
numbers; three feature cards; the board; the specimen (a redeem
calculator with three sliders and a live receipt); the mechanism (seven
steps in one card, rows light up on scroll); the math beside its table; the
comparison; six trust cards; FAQ cards that open one at a time; closing
banner. A first-visit boot screen pours the floor for two seconds, skippable.

**Buttons.** Round pills in Fredoka: dark label pill (orange at night),
coat pill with the seam, orange pill reserved for Redeem. Hover lifts 1 px.

**Re-adapted to FLOORED (same day).** The user asked that the Plush Pons
craft be brought back to our own material: the ground is concrete chalk and
graphite rather than wool and cocoa (`#eeece8`, ink `#1d1e22`, neutral
grain), and every scene is about the product. `lib/art/scene.ts` now has
five subjects: `site` (cranes lifting SOL coins over slabs being poured, the
hero), `floor` (one wide plinth with the coin stack on it), `brake` (a
staircase of slabs with a coin coming down one step at a time), `vault`
(a sealed block with a padlock mark and no door), `city` (the skyline of
floors, used for the closing banner and the footer). Feature cards and page
banners pick their subject by name.

**Site organisation (2026-10-18).** Pages carry one role each. Home is
short: the words, the board (the product), the three guarantees as cards,
the live numbers in one card, the closing banner. How it works carries the
long explanation in reading order: the problem, the seven-step mechanism,
the floor with the redeem calculator, the brake, the comparison, verify,
fees, FAQ. Stats carries the numbers, Challenge the proof, Create and
Portfolio the actions.

**English only (2026-10-18).** The French side is gone: one messages file,
no language toggle, no locale cookie. **Logo, third take:** an ink tile
with the orange floor line across its lower third and a stack of three
coins in the page colour standing on it; the wordmark is "floored." in the
display face, lowercase, the full stop in orange. Tile and coins follow the
theme, the floor stays orange.

**Scenes, second take (2026-10-18).** The city of slabs was a metaphor the
user did not read. The scenes now draw the mechanism itself: a pixel price
chart whose candles can fall but never through the 3 px orange floor line,
and under the floor the pool, still water with a few piles of SOL coins.
Four subjects: `chart` (a dump that lands on the floor and bounces, the
hero and the coin cards), `floor` (a quiet market on the floor, a tall
pile standing on it), `brake` (the crash comes down as a staircase, an
orange tick per window), `vault` (a padlock standing on the line). Few,
large elements on plain paper with three faint guides, no grid. The mark
follows: a coin resting on the floor line with a green candle that stopped
at the floor.

## v8 vault (after cardsvault.fun, 2026-10-20)

The user asked for "sobre mais magnifique" and pointed at cardsvault.fun.
One dark theme: ground `#070708`, cards `#111114` with one `#232329`
hairline and a 20 px radius, no shadows, no dashed seams, no pixel scenes.
Lexend 600 for headings, Manrope for text, JetBrains Mono for numbers.
Orange stays the only accent: one highlighted phrase per title, the kicker,
and a glossy pill for the action (radial top highlight, warm shadow). The
header is a full-width blurred bar with a hairline.

Home: the words on the left and a floor monitor on the right (a graduated
coin, its real 5 m closes over the orange floor line, price, floor, gap and
pool, arrows to walk through coins); three rules as numbers in one card
(100 % of the pool to holders, -20 % per minute at most, 0 admin keys); the
coin board; three numbered steps; one closing card. In mock mode the hero
and the stats page carry a "Demo data" chip. Removed: boot screen, the
stamped receipt, per-card fake charts, page-header scenes, the theme toggle.

## v9 "the board" (2026-10-20, from zero)

The user asked to forget every previous direction and pick a DA that
belongs to the project. FLOORED is a trading floor, so the site is one:
a station-style split-flap board where every coin is a row.

**Material.** Warm black housing (`#0b0b0a`), flap tiles in two greys
split by a dark hinge, flap ink `#f3efe4`. One accent, floor amber
`#ffad1f`, for the floor line and the action; green `#2fe27f` up, red
`#ff5160` down, orange `#ff6b2c` for the brake. Radii 3 to 10 px: a board
is rectangular.

**Type.** Big Shoulders 800 in capitals for headlines (station signage),
Inter Tight for text, JetBrains Mono bold for tiles, labels and buttons.

**The board.** `SplitFlap` renders a string as tiles; when a character
changes the old top half folds down and the new bottom half falls into
place (150 ms each), reduced motion just swaps it. The hero board shows
seven live coins (ticker, mcap, above floor with an arrow, status) and
stands on the glowing amber floor line. Coins without an image get one
tile with their first letter. The mark is one tile showing an F with the
amber floor under it.

**Home.** Headline and actions, the live board, the rules as three big
amber numbers, every coin in the full list, three steps, an amber closing
band with black type.

## v10 "the cube" (2026-10-20)

The user picked the Rubik's cube among six puzzle directions. Black plastic
body, six sticker colours and each one has a job: orange the floor and the
action, green up, red down, yellow the brake, blue new, white the curve.
Rubik is the one type family (800 for headlines, 400 to 600 for text),
JetBrains Mono for numbers. Stickers are rounded squares with a black gap
around them; buttons have a pressed bottom edge.

- Hero: a 3×3×3 CSS cube (`components/home/Cube.tsx`). Each cubie keeps a
  rotation matrix and a position; a quarter turn transitions one layer
  then commits into the matrices. It scrambles four moves, rests, plays
  them back and lands solved on its orange face, the floor. It leans
  toward the pointer; reduced motion keeps it still and solved.
- Today's face: nine live coins as stickers on one face, coloured by state,
  with a legend.
- Rules: three big stickers (100 %, −20 %, 0). Steps numbered on stickers.
  Closing band: one orange sticker the width of the page.
- Mark: one face of the cube, the bottom row orange. Coins without an
  image get a sticker in one of the six colours with their first letter.

## v11 "the cube, in daylight"

The user asked for a lighter, more colourful cube and a real homepage that tells the project as you scroll.

- **Ground**: cool light grey `#f4f5f7`, white cards, ink `#121318`. The cube's body stays black (`--cube-body #111216`): every face, the logo and frames around stickers are black plastic, so the six colours pop on a white table.
- **Colour bands**: whole sections are one sticker colour, and the colour keeps its job. Red is the problem (things going down), blue is how a coin is launched (new), green is the live face (up). Dark ink on green and yellow, white on red and blue. Orange stays the action and the closing band.
- **Homepage story** (`page.tsx`, `home/Story.tsx`): hero with the turning cube → red band, the problem (−95 %, $0) → the three rules, with a sticky face that starts scrambled and puts one orange row in place per rule as you scroll (bottom row first, the floor), "Solved" at the end, and it scrambles again if you scroll back → blue band, three steps → green band, nine live coins → every coin → questions → launch.
- **Motion**: the stickers flip in on their row (`.story-flip`, 460 ms, 70 ms stagger by column). Reduced motion keeps a fade.
- **Text-safe accents**: `--floor #f25c05`, `--up #0a9548`, `--down #d42a22` for text on white. The full-strength sticker colours (`--cube-*`) are for fills.

## v12 "turn the cube", and the name Cubie

The user found the banded homepage "seen before" and asked for a name that fits the project, with a capital.

- **Name**: Cubie (a cubie is one small block of the cube; the mark is a face of them). Domain cubie.fun was free on Vercel (1.99 $ then 27 $/yr), not bought. Visible copy, metadata, OG images and the wallet app name say Cubie; code identifiers (`FlooredEvent`, `@floored/web`, `floored-core`) and the on-chain demo coin "Floored Demo" keep their names.
- **Homepage** (`home/Turn.tsx`): one cube pinned to the screen for six screens of scroll. Scroll turns it a quarter at a time (it rests on each face, then turns, smoothstep), and each face is a chapter; the page background takes the colour of the face in front. White: the promise. Red: the problem. Green: 100 % of the pool. Yellow: −20 % a minute. Blue: 0 admin keys, launch in three steps. Orange, the bottom face: the floor, with the formula and the launch button. Six small stickers on the right show where you are and jump to a chapter. Below: nine live coins, every coin, questions.
- `Cube` takes `colors`, `still` and `cubeRef`, so the page drives its orientation. Reduced motion snaps to each face instead of scrubbing.
- Short screens (under 760 px tall) get a smaller cube and tighter type, so each chapter fits without scrolling inside it.

## v13 "every page is a face"

The user wanted the colour play to show more, everywhere.

- **Black frame**: the header, the footer and the live ticker are the cube's black plastic (`--cube-body`). The colours sit inside it like stickers.
- **A face per page** (`lib/faces.ts`): Coins green, Create orange, Portfolio blue, How it works yellow, Stats and the challenge red. Each nav item carries its sticker; the active one becomes a pill of that colour. `PageHeader face=…` is a full-width band in the page's colour with a small turning cube showing that face in front.
- **Home**: the page turns with the cube. The next face's colour slides in, synced with the scroll, from the side the face comes from (right for the four side turns, top for the last two), with a strip of black plastic on its leading edge. The words change once the colour has passed them. Reduced motion swaps colours without the slide. After the cube, the live part (nine coins, ticker, every coin) sits on the Coins green.
- The footer shows the six stickers under the wordmark; column headings carry their colour.

## v14 "light bar", and the brand becomes Cubelet

- The header is now a light bar on the page ground with a hairline under it. Links in ink, no stickers; the active page is underlined in its face colour (green Coins, orange Create, blue Portfolio, yellow How it works, red Stats). The underline sits under the text, not on the hairline, so it never melts into a face band of the same colour.
- The brand is **Cubelet**, the real name of one small piece of a Rubik's cube. cubie.xyz was taken; cubelet.xyz and cubelet.fun were both free on Vercel on 2026-10-20 (1.99 $ first year, then 13 $/yr .xyz, 27 $/yr .fun). Not bought. Placeholder links: github.com/cubelet-fun/cubelet, x.com/cubeletfun.
