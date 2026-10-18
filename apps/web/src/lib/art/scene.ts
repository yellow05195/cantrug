/*
 * Pixel-art scenes that draw what FLOORED does: a price chart whose candles
 * can fall but never through the orange floor line, and under the floor the
 * pool of SOL that belongs to the holders. Few, large elements, so the
 * picture reads as an illustration and not as a texture.
 *   chart: a dump that lands on the floor and bounces
 *   floor: a quiet market resting on the floor, the pool full
 *   brake: a crash that comes down as a staircase, one step per window
 *   vault: the pool sealed under the floor, a padlock on the line
 * Deterministic from a seed, served as an SVG data URI, no assets.
 */
import { PixelCanvas } from "./pixel";
import { createRng, hash32, type Rng } from "./seed";

export type SceneMood = "day" | "night";
export type SceneVariant = "chart" | "floor" | "brake" | "vault" | "city" | "site";

export type SceneOpts = {
  seed: number | string;
  mood: SceneMood;
  variant?: SceneVariant;
  w?: number;
  h?: number;
  density?: "calm" | "busy";
};

type Palette = {
  paper: string;
  guide: string;
  up: string;
  upDark: string;
  down: string;
  downDark: string;
  wick: string;
  floor: string;
  floorGlow: string;
  water: string;
  waterLight: string;
  waterDeep: string;
  coin: string;
  coinHi: string;
  coinDark: string;
  ink: string;
};

const PALETTES: Record<SceneMood, Palette> = {
  day: {
    paper: "#f1efea",
    guide: "#e3e0d9",
    up: "#3f9f60",
    upDark: "#2c7a47",
    down: "#d24a3f",
    downDark: "#a23730",
    wick: "#7d8189",
    floor: "#ee5a1c",
    floorGlow: "#f8c3ab",
    water: "#d6dfe8",
    waterLight: "#e6edf3",
    waterDeep: "#c3cfdb",
    coin: "#ee5a1c",
    coinHi: "#ffb48a",
    coinDark: "#b8400e",
    ink: "#1d1e22",
  },
  night: {
    paper: "#070b17",
    guide: "#111933",
    up: "#33d17a",
    upDark: "#1d8c50",
    down: "#ff5c6c",
    downDark: "#b03b48",
    wick: "#4b5478",
    floor: "#ff5f1f",
    floorGlow: "#5a2a14",
    water: "#0f1a36",
    waterLight: "#16244a",
    waterDeep: "#0a1228",
    coin: "#ff5f1f",
    coinHi: "#ffc39f",
    coinDark: "#b8400e",
    ink: "#f4f6ff",
  },
};

/* Price paths as fractions of the room above the floor (1 = high, 0 = on the floor). */
const PATHS = {
  chart: [0.42, 0.48, 0.56, 0.5, 0.62, 0.72, 0.66, 0.3, 0.0, 0.0, 0.14, 0.32, 0.46, 0.54, 0.7, 0.64, 0.8, 0.86],
  floor: [0.18, 0.14, 0.2, 0.1, 0.0, 0.0, 0.08, 0.16, 0.1, 0.06, 0.0, 0.04, 0.12, 0.18, 0.1, 0.14, 0.08, 0.16],
  brake: [0.92, 0.92, 0.74, 0.74, 0.56, 0.56, 0.38, 0.38, 0.2, 0.2, 0.0, 0.0, 0.0, 0.1, 0.18, 0.26, 0.3, 0.36],
  vault: [0.3, 0.26, 0.34, 0.28, 0.22, 0.3, 0.26, 0.2, 0.28, 0.34, 0.3, 0.24, 0.32, 0.28, 0.36, 0.3, 0.26, 0.32],
};

function coin(c: PixelCanvas, x: number, y: number, cw: number, ch: number, p: Palette): void {
  c.fillRect(x, y, cw, ch, p.coin);
  c.fillRect(x, y, cw - 1, 1, p.coinHi);
  c.fillRect(x + 1, y + ch - 1, cw - 1, 1, p.coinDark);
  c.set(x + cw - 1, y, p.coinDark);
}

function pile(c: PixelCanvas, x: number, bottom: number, n: number, cw: number, ch: number, p: Palette): void {
  for (let i = 0; i < n; i++) coin(c, x + (i % 2 === 0 ? 0 : 1), bottom - (i + 1) * ch, cw, ch, p);
}

function candle(c: PixelCanvas, x: number, cw: number, open: number, close: number, hi: number, lo: number, p: Palette): void {
  const up = close <= open; // y grows downwards
  const body = up ? p.up : p.down;
  const edge = up ? p.upDark : p.downDark;
  const top = Math.min(open, close);
  const bot = Math.max(open, close);
  const mid = x + Math.floor(cw / 2);
  c.fillRect(mid, hi, 1, lo - hi + 1, p.wick);
  c.fillRect(x, top, cw, Math.max(2, bot - top + 1), body);
  c.fillRect(x, Math.max(top, bot - 1 + (bot - top < 1 ? 1 : 0)), cw, 1, edge);
  c.fillRect(x + cw - 1, top, 1, Math.max(2, bot - top + 1), edge);
}

function stage(c: PixelCanvas, rng: Rng, w: number, h: number, floorY: number, p: Palette): void {
  c.fillRect(0, 0, w, h, p.paper);
  // three faint horizontal guides, nothing else on the paper
  for (let i = 1; i <= 3; i++) {
    const y = Math.round((floorY * i) / 4);
    for (let x = 0; x < w; x += 3) c.fillRect(x, y, 2, 1, p.guide);
  }
  // the floor line, 3 px, with a soft glow above
  c.fillRect(0, floorY - 1, w, 1, p.floorGlow);
  c.fillRect(0, floorY, w, 3, p.floor);
  // the pool: still water with two dithered ripples near the surface
  c.fillRect(0, floorY + 3, w, h - floorY - 3, p.water);
  for (let x = 0; x < w; x++) {
    if ((x >> 2) % 2 === 0) c.set(x, floorY + 4, p.waterLight);
    if (((x + 3) >> 2) % 2 === 0) c.set(x, floorY + 7, p.waterLight);
  }
  for (let x = 0; x < w; x++) if (x % 2 === 0) c.set(x, h - 1, p.waterDeep);
  // a few highlights on the water
  for (let i = 0; i < Math.round(w / 40); i++) c.fillRect(rng.int(2, w - 6), rng.int(floorY + 9, h - 4), 3, 1, p.waterLight);
}

function candles(c: PixelCanvas, rng: Rng, w: number, floorY: number, top: number, path: number[], p: Palette, jitter: number): void {
  const n = path.length;
  const cw = Math.max(3, Math.floor((w - 4) / n) - 2);
  const gap = Math.floor((w - 4 - n * cw) / (n - 1));
  const room = floorY - 3 - top;
  const yOf = (f: number) => floorY - 3 - Math.round(Math.max(0, Math.min(1, f)) * room);
  let prev = yOf(path[0]! + 0.04);
  for (let i = 0; i < n; i++) {
    const f = path[i]! + (rng.next() - 0.5) * jitter;
    const close = Math.max(top, Math.min(floorY - 4, yOf(f)));
    const open = prev;
    const hi = Math.max(top, Math.min(open, close) - rng.int(1, 3));
    const lo = Math.min(floorY - 3, Math.max(open, close) + rng.int(0, 2));
    candle(c, 2 + i * (cw + gap), cw, open, close, hi, lo, p);
    prev = close;
  }
}

export function renderScene(opts: SceneOpts): string {
  const w = opts.w ?? 200;
  const h = opts.h ?? 78;
  const v0 = opts.variant ?? "chart";
  const variant: "chart" | "floor" | "brake" | "vault" = v0 === "city" || v0 === "site" ? "chart" : v0;
  const mood = opts.mood;
  const p = PALETTES[mood];
  const rng = createRng(hash32(`scene:${String(opts.seed)}:${mood}:${variant}`));
  const c = new PixelCanvas(w, h);
  const floorY = Math.round(h * 0.7);
  const top = Math.max(3, Math.round(h * 0.08));
  const cw = Math.max(6, Math.round(w / 18)); // coin width
  const ch = Math.max(2, Math.round(cw / 3)); // coin thickness

  stage(c, rng, w, h, floorY, p);

  // coins in the pool: a few piles, never a wall
  const bottom = h - 2;
  const piles = variant === "floor" || variant === "vault" ? 4 : 3;
  for (let i = 0; i < piles; i++) {
    const x = Math.round((w * (i + 0.5)) / piles) - Math.round(cw / 2) + rng.int(-3, 3);
    const maxN = Math.floor((h - floorY - 6) / ch);
    pile(c, x, bottom, Math.max(1, Math.min(maxN, rng.int(2, maxN))), cw, ch, p);
  }

  // scatter a couple of loose coins on the pool floor
  for (let i = 0; i < 2; i++) coin(c, rng.int(2, w - cw - 2), bottom - ch, cw, ch, p);

  const path = PATHS[variant];
  candles(c, rng, w, floorY, top, path, p, variant === "brake" ? 0.02 : 0.06);

  if (variant === "brake") {
    // the step edges: the brake holding the price one window at a time
    const n = path.length;
    const slot = (w - 4) / n;
    const room = floorY - 3 - top;
    for (let i = 0; i < n - 1; i++) {
      if (path[i] === path[i + 1] && path[i]! > 0) {
        const y = floorY - 3 - Math.round(path[i]! * room) + 2;
        c.fillRect(Math.round(2 + i * slot), y, Math.round(slot * 2) - 2, 1, p.floor);
      }
    }
  }

  if (variant === "floor") {
    // the holders' share: one tall pile standing on the floor itself
    const x = Math.round(w * 0.62);
    const n = Math.min(6, Math.floor((floorY - top) / ch) - 4);
    for (let i = 0; i < n; i++) coin(c, x + (i % 2), floorY - (i + 1) * ch, cw, ch, p);
  }

  if (variant === "vault") {
    // a padlock standing on the floor line: nothing leaves the pool
    const s = Math.max(8, Math.round(w / 12));
    const lx = Math.round(w / 2 - s / 2);
    const ly = floorY - s - Math.round(s * 0.6);
    const shackle = Math.round(s * 0.6);
    c.fillRect(lx, ly + shackle, s, s, p.ink);
    c.fillRect(lx + 2, ly, s - 4, 2, p.ink);
    c.fillRect(lx + 2, ly, 2, shackle, p.ink);
    c.fillRect(lx + s - 4, ly, 2, shackle, p.ink);
    c.fillRect(lx + Math.round(s / 2) - 1, ly + shackle + Math.round(s / 2) - 1, 2, Math.round(s / 3), p.floor);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 8}" height="${h * 8}" shape-rendering="crispEdges" preserveAspectRatio="xMidYMax slice" role="img" aria-hidden="true">${c.toSvgRects()}</svg>`;
}

export function sceneDataUri(opts: SceneOpts): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(renderScene(opts))}`;
}
