"use client";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { NumRoll } from "@/components/ui/NumRoll";
import { tiny } from "@/lib/format";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

const PARTICLES = Array.from({ length: 8 }, (_, i) => {
  const a = (Math.PI * (i + 0.5)) / 8; // fan upward
  return { dx: Math.cos(a) * (46 + (i % 3) * 14), dy: -Math.sin(a) * (26 + (i % 2) * 16), s: 5 + (i % 3) * 2 };
});

/** Once per coin per session. */
export function slabShouldPlay(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const k = `floored.slab.${key}`;
    if (window.sessionStorage.getItem(k)) return false;
    window.sessionStorage.setItem(k, "1");
    return true;
  } catch {
    return true;
  }
}

/**
 * "The slab lands" (DESIGN.md v2 motion 7), 900 ms, rare: a concrete dust puff
 * (8 particles), the floor line draws left to right, the floor value pours in.
 * Reduced motion: everything is simply there.
 */
export function SlabLands({ floorSol, label, className }: { floorSol: number; label?: string; className?: string }) {
  const t = useTranslations("slab");
  const root = useRef<HTMLDivElement>(null);
  const value = floorSol > 0 ? tiny(floorSol, 4) : "0";
  const zeros = value.replace(/\d/g, "0");
  const reduce = typeof window !== "undefined" && prefersReducedMotion();

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const tl = gsap.timeline();
      tl.fromTo("[data-slab]", { yPercent: -60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.24, ease: "power3.out" }, 0)
        .fromTo(
          "[data-dust]",
          { x: 0, y: 0, scale: 0.6, opacity: 0.9 },
          { x: (i) => PARTICLES[i]!.dx, y: (i) => PARTICLES[i]!.dy, scale: 1.2, opacity: 0, duration: 0.6, ease: "power3.out" },
          0.2,
        )
        .fromTo("[data-line]", { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "power2.out", transformOrigin: "0% 50%" }, 0.24);
    },
    { scope: root },
  );

  return (
    <div ref={root} className={className}>
      <div className="relative mx-auto flex h-32 max-w-xs flex-col items-center justify-end">
        <p className="mb-1 text-xs font-semibold text-ink-2">{label ?? t("floor")}</p>
        <NumRoll value={value} rollFrom={reduce ? null : zeros} className="mb-3 text-3xl font-medium text-floor" label={`${value} SOL`} />
        <div className="relative w-full">
          <div data-slab className="h-5 w-full rounded-lg border-2 border-stroke bg-bg-3 shadow-[0_3px_0_0_var(--shadow)]" />
          <div data-line className="absolute inset-x-1 top-0 h-1.5 rounded-full bg-floor" />
          {PARTICLES.map((p, i) => (
            <span key={i} data-dust aria-hidden className="absolute left-1/2 top-0 rounded-full bg-ink-3 opacity-0" style={{ width: p.s, height: p.s, marginLeft: -p.s / 2, marginTop: -p.s / 2 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
