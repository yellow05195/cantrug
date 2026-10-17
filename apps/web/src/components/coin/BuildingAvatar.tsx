/**
 * BuildingAvatar: a deterministic flat cartoon building from a mint (or any
 * seed): 1 to 3 stacked blocks, a roof (flat, saw-tooth, antenna, water tank),
 * 2 to 6 lit orange windows, four concrete greys, all standing on an orange slab.
 * `buildingSpec` is pure so the OG image route can draw the same building.
 */
import { hashSeed, rng } from "@/lib/mock/rng";

export interface BuildingSpec {
  blocks: { x: number; y: number; w: number; h: number; tone: number }[];
  windows: { x: number; y: number; lit: boolean }[];
  roof: "flat" | "saw" | "antenna" | "tank";
  roofX: number;
  roofY: number;
  roofW: number;
  stars: { x: number; y: number }[];
}

const SLAB_Y = 55;

export function buildingSpec(seed: string): BuildingSpec {
  const r = rng(hashSeed(seed || "floored"));
  const n = r.int(1, 3);
  const blocks: BuildingSpec["blocks"] = [];
  let top = SLAB_Y;
  let w = r.int(30, 44);
  let cx = 32 + r.int(-3, 3);
  for (let i = 0; i < n; i++) {
    const h = n === 1 ? r.int(24, 34) : r.int(10, 17);
    const y = top - h;
    blocks.push({ x: Math.round(cx - w / 2), y, w, h, tone: r.int(0, 3) });
    top = y;
    w = Math.max(14, w - r.int(6, 12));
    cx += r.int(-3, 3);
  }
  // Windows on a 6 px grid inside each block; a handful are lit.
  const windows: BuildingSpec["windows"] = [];
  for (const b of blocks) {
    for (let y = b.y + 4; y + 4 <= b.y + b.h - 3; y += 6) {
      for (let x = b.x + 4; x + 3 <= b.x + b.w - 3; x += 6) windows.push({ x, y, lit: false });
    }
  }
  const lit = Math.min(windows.length, r.int(2, 6));
  for (let k = 0; k < lit; k++) {
    const i = r.int(0, windows.length - 1);
    if (windows[i]) windows[i]!.lit = true;
  }
  const roofs: BuildingSpec["roof"][] = ["flat", "saw", "antenna", "tank"];
  const topBlock = blocks[blocks.length - 1]!;
  const stars = Array.from({ length: 3 }, () => ({ x: r.int(5, 59), y: r.int(4, 16) }));
  return { blocks, windows, roof: r.pick(roofs), roofX: topBlock.x, roofY: topBlock.y, roofW: topBlock.w, stars };
}

export interface BuildingColors {
  sky: string;
  greys: [string, string, string, string];
  edge: string;
  dark: string;
  light: string;
  slab: string;
  star: string;
}

export const BUILDING_COLORS: BuildingColors = {
  sky: "var(--bg-2)",
  // Theme-driven: mixes of the ink into the ground, so day and night both read.
  greys: [
    "color-mix(in oklab, var(--ink) 34%, var(--bg-2))",
    "color-mix(in oklab, var(--ink) 44%, var(--bg-2))",
    "color-mix(in oklab, var(--ink) 54%, var(--bg-2))",
    "color-mix(in oklab, var(--ink) 26%, var(--bg-2))",
  ],
  edge: "var(--ink)",
  dark: "color-mix(in oklab, var(--ink) 70%, var(--bg-2))",
  light: "var(--floor)",
  slab: "var(--floor)",
  star: "var(--ink-3)",
};

function sawPath(rx: number, ry: number, rw: number): string {
  const teeth = Math.max(2, Math.floor(rw / 8));
  const step = rw / teeth;
  let d = `M${rx} ${ry}`;
  for (let i = 0; i < teeth; i++) d += ` L${rx + i * step} ${ry - 5} L${rx + (i + 1) * step} ${ry}`;
  return `${d} Z`;
}

export function BuildingSvg({ spec, colors = BUILDING_COLORS, size }: { spec: BuildingSpec; colors?: BuildingColors; size: number }) {
  const { roofX: rx, roofY: ry, roofW: rw } = spec;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden style={{ display: "block" }}>
      <rect width="64" height="64" fill={colors.sky} />
      {spec.stars.map((s, i) => (
        <rect key={i} x={s.x} y={s.y} width="1.5" height="1.5" fill={colors.star} opacity="0.6" />
      ))}
      {spec.roof === "antenna" ? (
        <g stroke={colors.edge} strokeWidth="1.5">
          <line x1={rx + rw / 2} y1={ry} x2={rx + rw / 2} y2={ry - 9} />
          <circle cx={rx + rw / 2} cy={ry - 10} r="1.6" fill={colors.light} />
        </g>
      ) : null}
      {spec.roof === "tank" ? (
        <g stroke={colors.edge} strokeWidth="1.5">
          <line x1={rx + rw - 9} y1={ry} x2={rx + rw - 9} y2={ry - 4} />
          <line x1={rx + rw - 4} y1={ry} x2={rx + rw - 4} y2={ry - 4} />
          <rect x={rx + rw - 11} y={ry - 10} width="9" height="6" rx="1.5" fill={colors.greys[2]} />
        </g>
      ) : null}
      {spec.roof === "saw" ? (
        <path
          d={sawPath(rx, ry, rw)}
          fill={colors.greys[3]}
          stroke={colors.edge}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      ) : null}
      {spec.blocks.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h + (i === 0 ? 0 : 1)} rx="1.5" fill={colors.greys[b.tone]} stroke={colors.edge} strokeWidth="1.5" />
      ))}
      {spec.windows.map((w, i) => (
        <rect key={i} x={w.x} y={w.y} width="3" height="3.5" rx="0.6" fill={w.lit ? colors.light : colors.dark} />
      ))}
      <rect x="4" y={SLAB_Y} width="56" height="4" rx="1" fill={colors.slab} />
    </svg>
  );
}

/** The avatar sticker: square, 12 px radius, 2 px stroke. */
export function BuildingAvatar({ seed, size = 56, className }: { seed: string; size?: number; className?: string }) {
  return (
    <span className={`block shrink-0 overflow-hidden rounded-full border border-seam ${className ?? ""}`} style={{ width: size, height: size }} aria-hidden>
      <BuildingSvg spec={buildingSpec(seed)} size={size - 4} />
    </span>
  );
}
