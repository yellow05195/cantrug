import { cn } from "@/lib/cn";

/*
 * The mark, drawn like the scenes: a pixel building of three floors standing
 * on its orange slab, a coin on the roof, on a 16 × 16 grid. It sits in a
 * soft disc of the card colour so it reads on both themes.
 */
const WALL = "#a3a7ae";
const WALL_DARK = "#6d7178";
const LIT = "#fbfbf8";
const DIM = "#7b7f87";
const FLOOR = "#ee5a1c";
const COIN_HI = "#ffb48a";

/* rows of the grid; "." is empty, letters index the palette below */
const GRID = [
  "................",
  "......oooo......",
  "......hooo......",
  "....wwwwwwww....",
  "....wLLwwLLw....",
  "....wLLwwLLw....",
  "....dddddddd....",
  "....wDDwwLLw....",
  "....wDDwwLLw....",
  "....dddddddd....",
  "....wLLwwDDw....",
  "....wLLwwDDw....",
  "....wwwwwwww....",
  ".ffffffffffffff.",
  ".gggggggggggggg.",
  "................",
];
const PALETTE: Record<string, string> = { w: WALL, d: WALL_DARK, L: LIT, D: DIM, f: FLOOR, g: WALL_DARK, o: FLOOR, h: COIN_HI };

function pixels() {
  const out: { x: number; y: number; w: number; c: string }[] = [];
  GRID.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x]!;
      if (ch === ".") {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run++;
      out.push({ x, y, w: run, c: PALETTE[ch]! });
      x += run;
    }
  });
  return out;
}
const PIXELS = pixels();

export function LogoMark({ size = 24, className, title, plain }: { size?: number; className?: string; title?: string; plain?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={cn("shrink-0", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title} shapeRendering="crispEdges">
      {plain ? null : <circle cx="8" cy="8" r="8" fill="var(--card-2)" shapeRendering="auto" />}
      {PIXELS.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={p.w} height={1} fill={p.c} />
      ))}
    </svg>
  );
}

/** Mark + wordmark: lowercase, display face, the full stop in orange. */
export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-display font-semibold tracking-tight text-ink", className)}>
      <LogoMark size={size} />
      <span className="leading-none">
        floored<span className="text-floor">.</span>
      </span>
    </span>
  );
}
