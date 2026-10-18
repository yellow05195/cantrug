import { cn } from "@/lib/cn";

/*
 * The mark, drawn like the scenes: a coin resting on the orange floor line,
 * a green candle beside it that stopped at the floor, on a 16 × 16 grid. It
 * sits in a soft disc of the card colour so it reads on both themes.
 */
const GRID = [
  "................",
  "..........g.....",
  ".........ggg....",
  ".........ggg....",
  ".........ggg....",
  ".....ccc.ggg....",
  "....chccc.g.....",
  "...cccccccg.....",
  "...ccccccc......",
  "...ccccccc......",
  "....ccccc.......",
  ".....ccc........",
  ".ffffffffffffff.",
  ".ffffffffffffff.",
  ".pppppppppppppp.",
  ".pppppppppppppp.",
];
const PALETTE: Record<string, string> = { c: "#ee5a1c", h: "#ffb48a", g: "#3d9a5c", f: "#ee5a1c", p: "#cfd5dc" };
const PALETTE_NIGHT: Record<string, string> = { ...PALETTE, g: "#33d17a", p: "#141b33" };

function pixels(pal: Record<string, string>) {
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
      out.push({ x, y, w: run, c: pal[ch]! });
      x += run;
    }
  });
  return out;
}
const DAY = pixels(PALETTE);
const NIGHT = pixels(PALETTE_NIGHT);

export function LogoMark({ size = 24, className, title, plain }: { size?: number; className?: string; title?: string; plain?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={cn("shrink-0", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title} shapeRendering="crispEdges">
      {plain ? null : <circle cx="8" cy="8" r="8" fill="var(--card-2)" shapeRendering="auto" />}
      <g className="logo-day">
        {DAY.map((p, i) => (
          <rect key={i} x={p.x} y={p.y} width={p.w} height={1} fill={p.c} />
        ))}
      </g>
      <g className="logo-night">
        {NIGHT.map((p, i) => (
          <rect key={i} x={p.x} y={p.y} width={p.w} height={1} fill={p.c} />
        ))}
      </g>
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
