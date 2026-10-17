# Assets

Generated with Higgsfield (GPT Image 2.5, 2k, "high") on 2026-10-17, then resized to WebP for the web (`assets/web`, copied to `apps/web/public/assets`). Raw 2688×1520 / 2048×1360 PNGs are in `assets/raw`. Logo files are hand-drawn SVG in `assets/logo` (an F standing on its orange slab; favicon at 16 px keeps a 3 px slab).

| file | use | status |
|---|---|---|
| `hero-slab` | home hero (cantilevered board-formed slab, orange level line) | done |
| `hero-slab-alt` | OG background, stats page header | done |
| `howitworks-brake` | "The brake" illustration (falling candle broken into hazard-striped steps, landing on the slab) | done |
| `howitworks-compare` | "FLOORED vs Pump" (left: the last fifth burns into cracked ground; right: it pours into the slab) | done |
| `kit-bg` | creator kit backdrop ("Launched on FLOORED, can't go to zero") | done |
| `howitworks-floor` | "The floor" illustration | **not generated**: the Higgsfield account hit its daily generation limit after the batch above. Prompt below; the web app ships an animated inline SVG of the same diagram in the meantime. |
| launch video 15–20 s (9:16 and 16:9) | X thread, tweet 6 | **not generated** (same daily limit). Storyboard and prompt below. |
| X avatar 400×400, X banner 1500×500 | social | derive from `assets/logo/floored-mark-dark-bg.svg` and `floored-wordmark.svg` over `kit-bg` (ImageMagick or Figma); no generation needed |
| OG per coin | `apps/web/app/api/og/[mint]` renders it at request time (name, ticker, floor, gap, orange line) | code |

## Prompts to run when the limit resets

**howitworks-floor** (model `gpt_image_2_5`, 3:2, quality high, 2k):

> Minimal technical illustration on dark charcoal (#141414) background, architectural section drawing style. A thick horizontal raw concrete slab fills the lower third, its top edge marked by a thin bright safety-orange line (#FF5F1F), like a laser level. Above the slab, a few small translucent glass blocks of different sizes rest on the line, each representing a holder's share; one block is lifted away leaving the others perfectly level. Fine white hairline dimension marks and a tiny level mark, no readable words. Matte, precise, Teenage Engineering manual aesthetic, soft grain, no people, no text.

**Launch video** (model `seedance_2_5` or `kling3_0`, 16:9 and 9:16, ~15 s, use `hero-slab.webp` as the image reference for the last shot):

Storyboard: 0–4 s a pale candlestick chart on black climbs then breaks into a vertical red plunge, camera tilting down with it, wind noise; 4–9 s the falling line hits yellow/black hazard ledges one after another, each impact a dull concrete thud, the line now descending in equal 20 % steps; 9–13 s the last step lands on a massive raw concrete slab whose top edge lights up as a thin safety-orange line from left to right, dust in hard light, the chart line rests flat on it and does not go lower; 13–17 s hold on the slab, text fades in (Inter Tight, off-white): "Pump burns your dead money." then "We give it back." then the F-on-slab mark and "floored.fun". Dark, matte, no music, three sound events only (break, thuds, a low concrete resonance at the landing). Deliver 1920×1080 and 1080×1920.

Prompt:

> Cinematic macro of a stock chart line drawn in pale light on black, rising, then snapping into a vertical red free fall; the line crashes onto a series of small concrete ledges striped yellow and black, breaking its fall into equal steps; it finally lands on a massive raw board-formed concrete slab whose top edge ignites as a thin safety-orange laser line sweeping left to right, dust suspended in hard directional light, the line lies flat and still on the orange edge. Dark charcoal palette, matte surfaces, architectural precision, slow camera tilt down then static, no people, no text.

**Avatar/banner**: `magick assets/logo/floored-mark-dark-bg.svg -resize 400x400 avatar.png` and compose the wordmark over `kit-bg` at 1500×500 with the tagline "The memecoin that can't go to zero." right-aligned in JetBrains Mono.

## v5 photograph slots (studio renders to generate)

The site currently shows Unsplash concrete photographs in grayscale (slots in
`apps/web/src/lib/images.ts`). Generate these six renders when the Higgsfield
daily limit resets (model `gpt_image_2_5` worked for the prompts below) and
swap the `src` of each slot; the frame, caption and grayscale treatment are
applied by the `Photo` component, so no other change is needed.

Shared style, prepend to every prompt: "Minimal architectural 3D render,
photoreal, matte dark charcoal concrete, deep near-black background, soft
studio key light from the upper left, subtle reflection on a dark polished
floor, sharp square geometry, one crisp thin safety-orange light line as the
only colour. No text, no logos, no people."

| Slot | Ratio | Subject |
| --- | --- | --- |
| `hero` | 3:2 or 4:5 | A single monolithic rectangular slab hovering a few centimetres over the floor, its front top edge glowing orange, a small neat stack of dark matte coins on its right part, empty space on the left third. |
| `curve` | 1:1 | A smooth ramp rising from the lower left to a flat plateau on the right, seen from the side, the plateau edge glowing orange. |
| `floor` | 1:1 | A thick horizontal slab seen at eye level, its top edge glowing orange, a tall column of dark matte coins standing on it. |
| `brake` | 1:1 | Three thick steps descending from left to right, seen from the side, the front top edge of each step marked by the orange line. |
| `vault` | 1:1 | A perfectly sealed solid cube with no door, no seam, no keyhole, resting on the floor, seen from a three-quarter angle, the orange line along its base. |
| `horizon` | 16:9 | An endless dark polished floor at night, low angle, one thin horizontal orange line of light at the far horizon, nothing else. |
