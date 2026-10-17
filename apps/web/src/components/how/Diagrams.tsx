/*
 * The drafting diagrams shared by the home "Blueprint" strip and How it works:
 * thin strokes, the orange slab, mono labels. No raster images, no icon library.
 * (Moved here from home/HomeSections.tsx; same drawings, sizeable.)
 */
export function FloorDiagram({ className = "h-24 w-full" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 96" className={className} aria-hidden>
      <rect x="0" y="70" width="160" height="26" fill="var(--bg-3)" />
      <rect x="0" y="68" width="160" height="3" fill="var(--floor)" />
      {(
        [
          [14, 46, 30],
          [52, 30, 24],
          [84, 54, 40],
          [132, 38, 18],
        ] as [number, number, number][]
      ).map(([x, y, w], i) => (
        <rect key={i} x={x} y={y} width={w} height={68 - y} fill="none" stroke="var(--ink-2)" strokeWidth="1.5" />
      ))}
      <path d="M 148 22 l 0 -10 m -4 4 l 4 -4 l 4 4" fill="none" stroke="var(--ink-3)" strokeWidth="1.2" />
      <text x="4" y="14" fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-3)">
        S / C
      </text>
    </svg>
  );
}

export function BrakeDiagram({ className = "h-24 w-full" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 96" className={className} aria-hidden>
      <rect x="0" y="70" width="160" height="26" fill="var(--bg-3)" />
      <rect x="0" y="68" width="160" height="3" fill="var(--floor)" />
      <path d="M 10 18 L 40 18 L 40 34 L 70 34 L 70 50 L 100 50 L 100 66" fill="none" stroke="var(--down)" strokeWidth="2" strokeLinejoin="round" />
      {(
        [
          [38, 18],
          [68, 34],
          [98, 50],
        ] as [number, number][]
      ).map(([x, y], i) => (
        <rect key={i} x={x - 8} y={y - 2} width="14" height="4" rx="1" fill="var(--brake)" />
      ))}
      <line x1="118" y1="18" x2="118" y2="34" stroke="var(--ink-3)" strokeWidth="1" />
      <line x1="114" y1="18" x2="122" y2="18" stroke="var(--ink-3)" strokeWidth="1" />
      <line x1="114" y1="34" x2="122" y2="34" stroke="var(--ink-3)" strokeWidth="1" />
      <text x="126" y="29" fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-3)">
        −20 %
      </text>
    </svg>
  );
}

export function VerifyDiagram({ className = "h-24 w-full" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 96" className={className} aria-hidden>
      <rect x="0" y="70" width="160" height="26" fill="var(--bg-3)" />
      <rect x="0" y="68" width="160" height="3" fill="var(--floor)" />
      {[
        ["pool_sol_vault", 14],
        ["pool_token_vault", 32],
        ["mint supply", 50],
      ].map(([label, y]) => (
        <g key={label as string}>
          <rect x="6" y={(y as number) - 10} width="104" height="14" rx="2" fill="none" stroke="var(--stroke-strong)" strokeWidth="1" />
          <text x="11" y={y as number} fontFamily="var(--font-mono)" fontSize="8" fill="var(--ink-2)">
            {label}
          </text>
        </g>
      ))}
      <text x="120" y="40" fontFamily="var(--font-mono)" fontSize="16" fill="var(--floor)">
        ÷
      </text>
      <text x="118" y="60" fontFamily="var(--font-mono)" fontSize="9" fill="var(--ink-3)">
        = floor
      </text>
    </svg>
  );
}


/** FLOORED vs Pump: the same dump, two endings. Left, the liquidity is gone and the line ends at zero; right, it stops on the slab. */
export function CompareDiagram({ className = "h-24 w-full" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 96" className={className} aria-hidden>
      {/* left: no slab, the ground is broken */}
      <path d="M 4 72 L 30 72 L 34 76 L 40 70 L 46 74 L 76 74" fill="none" stroke="var(--stroke-strong)" strokeWidth="1.5" strokeDasharray="3 3" />
      <path d="M 8 16 L 26 16 L 46 72 L 70 72" fill="none" stroke="var(--down)" strokeWidth="2" strokeLinejoin="round" />
      <text x="6" y="90" fontFamily="var(--font-mono)" fontSize="8" fill="var(--ink-3)">
        pump: 0
      </text>
      <line x1="80" y1="8" x2="80" y2="92" stroke="var(--stroke)" strokeWidth="1" />
      {/* right: the slab holds */}
      <rect x="84" y="70" width="76" height="26" fill="var(--bg-3)" />
      <rect x="84" y="68" width="76" height="3" fill="var(--floor)" />
      <path d="M 88 16 L 104 16 L 104 30 L 118 30 L 118 44 L 132 44 L 132 58 L 156 58" fill="none" stroke="var(--ink-2)" strokeWidth="2" strokeLinejoin="round" />
      <text x="88" y="90" fontFamily="var(--font-mono)" fontSize="8" fill="var(--floor)">
        floored: ±0.00
      </text>
    </svg>
  );
}
