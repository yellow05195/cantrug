"use client";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { heroFirstVisit } from "./HeroMotion";

/*
 * The hero's only "image": a drawing. A price line climbs, breaks, and falls
 * onto the slab. The slab holds. A dimension line on the right measures the
 * last allowed step (the brake), a level mark at the left reads ±0.00 (the
 * floor). Drawn once per session with GSAP; static and complete under reduced
 * motion or on later visits.
 *
 * Geometry (viewBox 480 × 300): the slab top is y = 226, the floor line the
 * page continues as its datum.
 */

const W = 480;
const SLAB_Y = 226;
// The price path: a jagged climb, a peak, then the fall broken into brake steps.
const CLIMB = "M 18 190 L 48 176 L 70 184 L 96 150 L 120 158 L 150 118 L 176 128 L 204 92 L 228 100 L 250 70 L 268 78 L 286 56";
const STEPS = [
  [286, 56, 300, 56],
  [300, 56, 300, 90],
  [300, 90, 326, 90],
  [326, 90, 326, 124],
  [326, 124, 352, 124],
  [352, 124, 352, 158],
  [358, 158, 384, 158],
  [384, 158, 384, 192],
  [384, 192, 410, 192],
  [410, 192, 410, SLAB_Y - 2],
] as const;
const FALL = STEPS.map(([x1, y1, x2, y2], i) => `${i === 0 ? `M ${x1} ${y1}` : ""} L ${x2} ${y2}`).join(" ");

export function CrashScene({ className }: { className?: string }) {
  const t = useTranslations("home.scene");
  const root = useRef<SVGSVGElement>(null);

  useGSAP(
    () => {
      const svg = root.current;
      if (!svg) return;
      const climb = svg.querySelector<SVGPathElement>("[data-climb]");
      const fall = svg.querySelector<SVGPathElement>("[data-fall]");
      if (!climb || !fall) return;
      const first = heroFirstVisit();
      if (!first || prefersReducedMotion()) return;
      const lc = climb.getTotalLength();
      const lf = fall.getTotalLength();
      gsap.set(climb, { strokeDasharray: lc, strokeDashoffset: lc });
      gsap.set(fall, { strokeDasharray: lf, strokeDashoffset: lf });
      gsap.set("[data-dust]", { opacity: 0, scale: 0.4, transformOrigin: "50% 100%" });
      gsap.set("[data-slab-edge]", { opacity: 0.35 });
      gsap.set("[data-dim]", { opacity: 0 });
      gsap.set("[data-marker]", { opacity: 0 });
      const tl = gsap.timeline({ defaults: { ease: "none" }, delay: 0.35 });
      tl.to(climb, { strokeDashoffset: 0, duration: 1.1 })
        // the brake: each step is a deliberate pause, then a drop
        .to(fall, { strokeDashoffset: 0, duration: 1.3, ease: "steps(10)" })
        // impact: the slab lights up, dust, then the dimension line and the live marker appear
        .to("[data-slab-edge]", { opacity: 1, duration: 0.25, ease: "power2.out" }, "-=0.05")
        .to("[data-dust]", { opacity: 1, scale: 1, duration: 0.18, ease: "power2.out", stagger: 0.02 }, "<")
        .to("[data-dust]", { opacity: 0, y: -10, duration: 0.6, ease: "power1.out", stagger: 0.02 }, ">-0.05")
        .to("[data-dim]", { opacity: 1, duration: 0.35, ease: "power2.out" }, "-=0.4")
        .to("[data-marker]", { opacity: 1, duration: 0.2 }, "<");
    },
    { scope: root },
  );

  return (
    <svg ref={root} viewBox={`0 0 ${W} 300`} role="img" aria-label={t("alt")} className={className} style={{ overflow: "visible" }}>
      <defs>
        <pattern id="formwork" width="24" height="300" patternUnits="userSpaceOnUse">
          <rect width="24" height="300" fill="transparent" />
          <line x1="23.5" y1={SLAB_Y} x2="23.5" y2="300" stroke="var(--stroke)" strokeWidth="1" />
        </pattern>
        <pattern id="tie-holes" width="48" height="36" patternUnits="userSpaceOnUse" x="12" y={SLAB_Y + 14}>
          <circle cx="4" cy="4" r="2.2" fill="var(--bg)" />
        </pattern>
      </defs>

      {/* drafting grid behind the scene */}
      <g aria-hidden opacity="0.5">
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`h${i}`} x1="0" x2={W} y1={16 + i * 26} y2={16 + i * 26} stroke="var(--stroke)" strokeWidth="1" strokeDasharray="2 6" />
        ))}
      </g>

      {/* the slab: board-formed concrete with tie holes, an orange edge on top */}
      <g aria-hidden>
        <rect x="0" y={SLAB_Y} width={W} height={300 - SLAB_Y} fill="var(--bg-3)" />
        <rect x="0" y={SLAB_Y} width={W} height={300 - SLAB_Y} fill="url(#formwork)" />
        <rect x="0" y={SLAB_Y} width={W} height={300 - SLAB_Y} fill="url(#tie-holes)" />
        <rect data-slab-edge x="0" y={SLAB_Y - 3} width={W} height="4" fill="var(--floor)" />
        <rect data-slab-edge x="0" y={SLAB_Y - 10} width={W} height="8" fill="var(--floor)" opacity="0.18" />
      </g>

      {/* level mark at the left: ±0.00 */}
      <g aria-hidden fontFamily="var(--font-mono)" fontSize="11" fill="var(--ink-3)">
        <path d={`M 4 ${SLAB_Y - 24} l 10 0 l -5 ${8} z`} fill="var(--floor)" />
        <text x="18" y={SLAB_Y - 15}>±0.00</text>
        <text x="18" y={SLAB_Y - 30} fontSize="9" fill="var(--ink-3)">
          {t("levelMark")}
        </text>
      </g>

      {/* the price: climb, then the braked fall */}
      <path data-climb d={CLIMB} fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <path data-fall d={FALL} fill="none" stroke="var(--down)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* hazard ledges where each step pauses: the brake */}
      <g aria-hidden>
        {STEPS.filter((_, i) => i % 2 === 0 && i > 0).map(([x1, y1, x2]) => (
          <g key={`${x1}-${y1}`}>
            <rect x={x1 - 2} y={y1 - 3} width={x2 - x1 + 4} height="6" rx="1.5" fill="var(--brake)" />
            <rect x={x1 - 2} y={y1 - 3} width={x2 - x1 + 4} height="6" rx="1.5" fill="url(#hazard)" />
          </g>
        ))}
        <pattern id="hazard" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="4" height="8" fill="var(--brake-ink)" opacity="0.9" />
        </pattern>
      </g>

      {/* dust at the impact */}
      <g aria-hidden fill="var(--ink-3)">
        {(
          [
            [396, 6, 2.5],
            [404, 10, 2],
            [412, 4, 3],
            [420, 12, 1.8],
            [428, 7, 2.4],
            [436, 11, 1.6],
          ] as [number, number, number][]
        ).map(([x, dy, r], i) => (
          <circle key={i} data-dust cx={x} cy={SLAB_Y - dy} r={r} opacity="0.9" />
        ))}
      </g>

      {/* live marker where the line rests on the floor */}
      <g data-marker aria-hidden>
        <circle cx="410" cy={SLAB_Y - 4} r="4" fill="var(--floor)" />
        <circle cx="410" cy={SLAB_Y - 4} r="4" fill="var(--floor)" className="scene-pulse" />
      </g>

      {/* dimension line: one brake step, read as −20 % per window */}
      <g data-dim aria-hidden stroke="var(--ink-3)" strokeWidth="1" fontFamily="var(--font-mono)" fontSize="10" fill="var(--ink-2)">
        <line x1="446" y1="158" x2="446" y2="192" />
        <line x1="440" y1="158" x2="452" y2="158" />
        <line x1="440" y1="192" x2="452" y2="192" />
        <line x1="384" y1="158" x2="446" y2="158" strokeDasharray="2 3" />
        <line x1="410" y1="192" x2="446" y2="192" strokeDasharray="2 3" />
        <text x="452" y="171" stroke="none">
          −20 %
        </text>
        <text x="452" y="183" stroke="none" fontSize="9" fill="var(--ink-3)">
          {t("perWindow")}
        </text>
      </g>
    </svg>
  );
}
