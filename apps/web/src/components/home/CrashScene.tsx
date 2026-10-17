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
      gsap.set("[data-marker]", { opacity: 0 });
      const tl = gsap.timeline({ defaults: { ease: "none" }, delay: 0.35 });
      tl.to(climb, { strokeDashoffset: 0, duration: 1.1 })
        // the brake: each step is a deliberate pause, then a drop
        .to(fall, { strokeDashoffset: 0, duration: 1.3, ease: "steps(10)" })
        // impact: the slab lights up, dust, then the dimension line and the live marker appear
        .to("[data-slab-edge]", { opacity: 1, duration: 0.25, ease: "power2.out" }, "-=0.05")
        .to("[data-dust]", { opacity: 1, scale: 1, duration: 0.18, ease: "power2.out", stagger: 0.02 }, "<")
        .to("[data-dust]", { opacity: 0, y: -10, duration: 0.6, ease: "power1.out", stagger: 0.02 }, ">-0.05")
        .to("[data-marker]", { opacity: 1, duration: 0.2 }, "-=0.3");
    },
    { scope: root },
  );

  return (
    <svg ref={root} viewBox={`0 0 ${W} 252`} role="img" aria-label={t("alt")} className={className} style={{ overflow: "visible" }}>
      {/* the slab: board-formed concrete with tie holes, an orange edge on top */}
      <g aria-hidden>
        <rect x="0" y={SLAB_Y} width={W} height={252 - SLAB_Y} fill="var(--bg-3)" />
        <rect data-slab-edge x="0" y={SLAB_Y - 2} width={W} height="3" fill="var(--floor)" />
      </g>

      {/* the price: climb, then the braked fall */}
      <path data-climb d={CLIMB} fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <path data-fall d={FALL} fill="none" stroke="var(--down)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* hazard ledges where each step pauses: the brake */}
      <g aria-hidden>
        {STEPS.filter((_, i) => i % 2 === 0 && i > 0).map(([x1, y1, x2]) => (
          <rect key={`${x1}-${y1}`} x={x1 - 2} y={y1 - 2} width={x2 - x1 + 4} height="4" rx="1" fill="var(--brake)" />
        ))}
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

    </svg>
  );
}
