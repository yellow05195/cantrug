/*
 * Pixel-art scenes drawn for FLOORED. Every picture is about the product:
 * poured floors whose edge is the orange floor line, coins (SOL) that sit on
 * them, cranes that lift them, the staircase of the brake, the sealed block
 * of the pool. Concrete greys by day, blue night with lit windows after dark.
 * Deterministic from a seed, served as an SVG data URI, no assets.
 */
import { PixelCanvas } from "./pixel";
import { createRng, hash32, type Rng } from "./seed";

export type SceneMood = "day" | "night";
/** city: skyline of floors · site: cranes lifting coins · floor: one slab with the coin stack · brake: the staircase · vault: the sealed block */
export type SceneVariant = "city" | "site" | "floor" | "brake" | "vault";

export type SceneOpts = {
  seed: number | string;
  mood: SceneMood;
  variant?: SceneVariant;
  w?: number;
  h?: number;
  density?: "calm" | "busy";
};

type Palette = {
  sky: [string, string, string];
  cloud: string;
  cloudShade: string;
  orb: string | null;
  far: string[];
  mid: string[];
  slab: string;
  floorLine: string;
  windowLit: string;
  windowDark: string;
  ground: string;
  groundLine: string;
  crane: string;
  coin: string;
  coinHi: string;
  star: string;
};

const PALETTES: Record<SceneMood, Palette> = {
  day: {
    sky: ["#eceef1", "#e3e6ea", "#d8dce2"],
    cloud: "#f8f9fa",
    cloudShade: "#e9ebee",
    orb: "#f2c57c",
    far: ["#c3c6cc", "#b8bcc3"],
    mid: ["#a3a7ae", "#979ba3", "#aeb2b8"],
    slab: "#6d7178",
    floorLine: "#ee5a1c",
    windowLit: "#fbfbf8",
    windowDark: "#7b7f87",
    ground: "#c9ccd1",
    groundLine: "#b3b7bd",
    crane: "#4a4d55",
    coin: "#ee5a1c",
    coinHi: "#ffb48a",
    star: "#ffffff",
  },
  night: {
    sky: ["#05070f", "#080c19", "#0c1122"],
    cloud: "#121a33",
    cloudShade: "#0c1122",
    orb: "#d8d2c0",
    far: ["#0f1629", "#121a33"],
    mid: ["#182040", "#1a2447", "#141c38"],
    slab: "#232c4d",
    floorLine: "#ff5f1f",
    windowLit: "#ffb27a",
    windowDark: "#0b1020",
    ground: "#080c19",
    groundLine: "#121a33",
    crane: "#2d3760",
    coin: "#ff5f1f",
    coinHi: "#ffc39f",
    star: "#c9d0ea",
  },
};

const FH = 5; // one floor, in pixels

function ditherBand(c: PixelCanvas, y: number, w: number, color: string): void {
  for (let x = 0; x < w; x++) if ((x + y) % 2 === 0) c.set(x, y, color);
}

function cloud(c: PixelCanvas, rng: Rng, cx: number, cy: number, p: Palette): void {
  const rw = rng.int(7, 13);
  c.fillEllipse(cx, cy, rw, 2.6, p.cloud);
  c.fillEllipse(cx - rw * 0.4, cy - 1.6, rw * 0.5, 2, p.cloud);
  c.fillEllipse(cx + rw * 0.35, cy - 1.2, rw * 0.45, 1.8, p.cloud);
  for (let x = Math.floor(cx - rw); x <= cx + rw; x++) {
    if ((x + cy) % 2 === 0 && c.get(x, cy + 2) === p.cloud) c.set(x, cy + 2, p.cloudShade);
  }
}

/** A SOL coin: a 3×3 orange square with a highlight. */
function coin(c: PixelCanvas, x: number, y: number, p: Palette): void {
  c.fillRect(x, y, 3, 3, p.coin);
  c.set(x, y, p.coinHi);
}

/** A stack of coins standing on (x, baseY). */
function coinStack(c: PixelCanvas, x: number, baseY: number, n: number, p: Palette): void {
  for (let i = 0; i < n; i++) coin(c, x, baseY - 3 * (i + 1), p);
}

/** The poured slab under something: 2 px of concrete with the orange line on top. */
function slab(c: PixelCanvas, x: number, y: number, w: number, p: Palette): void {
  c.fillRect(x, y - 2, w, 2, p.slab);
  c.fillRect(x, y - 3, w, 1, p.floorLine);
}

/** A building: floors stacked on a slab, windows, each floor edge drawn. */
function building(c: PixelCanvas, rng: Rng, x: number, groundY: number, bw: number, floors: number, wall: string, p: Palette, lit: number): void {
  const top = groundY - 3 - floors * FH;
  c.fillRect(x, top, bw, floors * FH, wall);
  for (let f = 1; f < floors; f++) c.fillRect(x, top + f * FH, bw, 1, p.slab);
  for (let f = 0; f < floors; f++) {
    for (let wx = x + 2; wx < x + bw - 2; wx += 4) c.fillRect(wx, top + f * FH + 2, 2, 2, rng.chance(lit) ? p.windowLit : p.windowDark);
  }
  slab(c, x - 1, groundY, bw + 2, p);
}

/** A building under construction: only its slabs are poured, a few columns between them. */
function skeleton(c: PixelCanvas, x: number, groundY: number, bw: number, floors: number, p: Palette): void {
  for (let f = 0; f <= floors; f++) {
    const y = groundY - f * FH;
    c.fillRect(x, y - 1, bw, 1, p.slab);
    if (f > 0) for (let cx = x + 1; cx < x + bw; cx += 5) c.fillRect(cx, y, 1, FH - 1, p.slab);
  }
  slab(c, x - 1, groundY, bw + 2, p);
}

/** A crane with a coin on its hook. */
function crane(c: PixelCanvas, rng: Rng, x: number, groundY: number, p: Palette, withCoin = true): void {
  const h = rng.int(28, 40);
  const arm = rng.int(18, 28);
  c.fillRect(x, groundY - h, 2, h, p.crane);
  c.fillRect(x - 5, groundY - h, arm, 1, p.crane);
  c.fillRect(x - 5, groundY - h + 1, 4, 1, p.crane);
  const hookX = x - 5 + arm - 4;
  const drop = rng.int(6, 14);
  c.fillRect(hookX + 1, groundY - h + 1, 1, drop, p.crane);
  if (withCoin) coin(c, hookX, groundY - h + 1 + drop, p);
}

function sky(c: PixelCanvas, rng: Rng, w: number, h: number, groundY: number, p: Palette, mood: SceneMood): void {
  const b0 = Math.round(h * 0.34);
  const b1 = Math.round(h * 0.62);
  c.fillRect(0, 0, w, b0, p.sky[0]);
  c.fillRect(0, b0, w, b1 - b0, p.sky[1]);
  c.fillRect(0, b1, w, groundY - b1, p.sky[2]);
  ditherBand(c, b0 - 1, w, p.sky[1]);
  ditherBand(c, b0 + 1, w, p.sky[0]);
  ditherBand(c, b1 - 1, w, p.sky[2]);
  ditherBand(c, b1 + 1, w, p.sky[1]);
  if (mood === "night") for (let i = 0; i < Math.round(w * 0.3); i++) c.set(rng.int(0, w - 1), rng.int(0, b1 - 4), rng.chance(0.3) ? p.star : "#3a4470");
  if (p.orb) {
    const ox = rng.int(Math.round(w * 0.12), Math.round(w * 0.88));
    const oy = rng.int(6, b0);
    c.fillEllipse(ox, oy, 4, 4, p.orb);
    if (mood === "night") c.fillEllipse(ox + 1.5, oy - 0.5, 2.6, 2.6, p.sky[0]);
  }
  const n = rng.int(2, 4);
  for (let i = 0; i < n; i++) cloud(c, rng, rng.int(6, w - 6), rng.int(5, b1 - 8), p);
}

function farSkyline(c: PixelCanvas, rng: Rng, w: number, groundY: number, p: Palette): void {
  let x = -rng.int(0, 4);
  while (x < w) {
    const bw = rng.int(10, 18);
    const bh = rng.int(8, 18);
    c.fillRect(x, groundY - 14 - bh, bw, bh + 14, rng.pick(p.far));
    x += bw + rng.int(0, 2);
  }
}

function ground(c: PixelCanvas, rng: Rng, w: number, h: number, groundY: number, p: Palette): void {
  c.fillRect(0, groundY, w, h - groundY, p.ground);
  c.fillRect(0, groundY, w, 1, p.floorLine);
  for (let gx = rng.int(0, 4); gx < w; gx += rng.int(10, 16)) c.fillRect(gx, groundY + 3, 1, h - groundY - 3, p.groundLine);
}

export function renderScene(opts: SceneOpts): string {
  const w = opts.w ?? 200;
  const h = opts.h ?? 78;
  const variant = opts.variant ?? "city";
  const mood = opts.mood;
  const p = PALETTES[mood];
  const rng = createRng(hash32(`scene:${String(opts.seed)}:${mood}:${variant}`));
  const c = new PixelCanvas(w, h);
  const busy = opts.density === "busy";
  const groundY = h - 9;
  const lit = mood === "night" ? 0.55 : 0.25;
  const maxFloors = Math.max(2, Math.floor((groundY - 22) / FH));

  sky(c, rng, w, h, groundY, p, mood);

  if (variant === "city" || variant === "site") {
    farSkyline(c, rng, w, groundY, p);
    const nCranes = variant === "site" ? rng.int(2, 3) : busy ? 1 : rng.int(0, 1);
    for (let i = 0; i < nCranes; i++) crane(c, rng, rng.int(14, w - 30), groundY, p, variant === "site");
    let x = -rng.int(0, 5);
    while (x < w) {
      const bw = rng.int(12, 22);
      const floors = Math.min(maxFloors, rng.int(busy ? 3 : 2, busy ? 7 : 5));
      if (variant === "site" && rng.chance(0.35)) skeleton(c, x, groundY, bw, Math.max(1, floors - 1), p);
      else building(c, rng, x, groundY, bw, floors, rng.pick(p.mid), p, lit);
      if (variant === "site" && rng.chance(0.3)) coinStack(c, x + rng.int(2, Math.max(2, bw - 4)), groundY - 3, rng.int(1, 3), p);
      x += bw + rng.int(2, 5);
    }
  }

  if (variant === "floor") {
    farSkyline(c, rng, w, groundY, p);
    // one wide plinth in the middle with the coin stack on it: the floor and what it holds
    const pw = Math.round(w * 0.46);
    const px = Math.round((w - pw) / 2);
    const ph = FH * 2;
    c.fillRect(px, groundY - 3 - ph, pw, ph, rng.pick(p.mid));
    c.fillRect(px, groundY - 3 - ph + FH, pw, 1, p.slab);
    slab(c, px - 1, groundY, pw + 2, p);
    const top = groundY - 3 - ph;
    c.fillRect(px, top - 3, pw, 1, p.floorLine);
    c.fillRect(px, top - 2, pw, 2, p.slab);
    const n = Math.min(Math.floor((top - 8) / 3), 6);
    coinStack(c, px + Math.round(pw / 2) - 4, top - 3, n, p);
    coinStack(c, px + Math.round(pw / 2) + 1, top - 3, Math.max(1, n - 2), p);
    coinStack(c, px + Math.round(pw / 2) - 9, top - 3, Math.max(1, n - 3), p);
    // two small buildings at the sides
    building(c, rng, 2, groundY, rng.int(10, 14), 2, rng.pick(p.mid), p, lit);
    building(c, rng, w - 16, groundY, rng.int(10, 14), 2, rng.pick(p.mid), p, lit);
  }

  if (variant === "brake") {
    farSkyline(c, rng, w, groundY, p);
    // a staircase descending from left to right: every step is a slab with its edge
    const steps = 5;
    const sw = Math.floor((w - 8) / steps);
    for (let i = 0; i < steps; i++) {
      const x = 4 + i * sw;
      const floors = Math.min(maxFloors, steps + 1 - i);
      const wall = rng.pick(p.mid);
      const top = groundY - 3 - floors * FH;
      c.fillRect(x, top, sw - 1, floors * FH, wall);
      for (let f = 1; f < floors; f++) c.fillRect(x, top + f * FH, sw - 1, 1, p.slab);
      c.fillRect(x, top - 1, sw - 1, 1, p.floorLine);
      for (let f = 0; f < floors; f++) for (let wx = x + 2; wx < x + sw - 3; wx += 4) c.fillRect(wx, top + f * FH + 2, 2, 2, rng.chance(lit) ? p.windowLit : p.windowDark);
    }
    slab(c, 3, groundY, w - 6, p);
    // the coin that comes down the stairs, one step at a time
    coin(c, 4 + sw * 2 + Math.round(sw / 2) - 1, groundY - 3 - (steps - 1) * FH - 4, p);
  }

  if (variant === "vault") {
    farSkyline(c, rng, w, groundY, p);
    const vw = Math.round(w * 0.34);
    const vx = Math.round((w - vw) / 2);
    const vh = Math.min(groundY - 14, FH * 6);
    const top = groundY - 3 - vh;
    c.fillRect(vx, top, vw, vh, p.slab);
    // a lighter face, no door, no window
    c.fillRect(vx + 2, top + 2, vw - 4, vh - 2, rng.pick(p.mid));
    c.fillRect(vx, top - 1, vw, 1, p.floorLine);
    slab(c, vx - 2, groundY, vw + 4, p);
    // a padlock mark on the face
    const lx = vx + Math.round(vw / 2) - 2;
    const ly = top + Math.round(vh / 2) - 1;
    c.fillRect(lx, ly, 5, 4, p.floorLine);
    c.fillRect(lx + 1, ly - 2, 3, 2, p.floorLine);
    c.set(lx + 2, ly - 2, p.windowDark);
    building(c, rng, 2, groundY, rng.int(12, 16), 3, rng.pick(p.mid), p, lit);
    building(c, rng, w - 18, groundY, rng.int(12, 16), 3, rng.pick(p.mid), p, lit);
  }

  ground(c, rng, w, h, groundY, p);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w * 8}" height="${h * 8}" shape-rendering="crispEdges" preserveAspectRatio="xMidYMax slice" role="img" aria-hidden="true">${c.toSvgRects()}</svg>`;
}

export function sceneDataUri(opts: SceneOpts): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(renderScene(opts))}`;
}
