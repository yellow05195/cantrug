"use client";
import { useRef, type ReactNode } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

const KEY = "floored.hero-entrance";
let cached: boolean | null = null;

/** True on the first home visit of the session (client only). Read once, then remembered. */
export function heroFirstVisit(): boolean {
  if (typeof window === "undefined") return false;
  if (cached !== null) return cached;
  try {
    cached = !window.sessionStorage.getItem(KEY) && !prefersReducedMotion();
  } catch {
    cached = false;
  }
  return cached;
}

/**
 * Hero entrance (DESIGN.md v2 motion 2), once per session: headline lines rise
 * 12 px and fade with a 60 ms stagger, the slab's orange line "ignites" (a dark
 * veil sweeps off the photo in 600 ms), the counter pours in (NumRoll rollFrom).
 * About 1.1 s total; nothing is blocked while it plays.
 */
export function HeroMotion({ children, className }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (!heroFirstVisit()) return;
      try {
        window.sessionStorage.setItem(KEY, "1");
      } catch {
        /* storage blocked */
      }
      // Later mounts (client navigation back home) start settled. Deferred so a
      // strict-mode effect replay in development still plays the entrance.
      setTimeout(() => {
        cached = false;
      }, 1500);
      const el = root.current;
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      // Only animate targets that exist on the current hero (GSAP warns on empty selectors).
      if (el?.querySelector("[data-hero-line]")) tl.from("[data-hero-line]", { y: 12, opacity: 0, duration: 0.5, stagger: 0.06 }, 0);
      if (el?.querySelector("[data-hero-sub]")) tl.from("[data-hero-sub]", { y: 12, opacity: 0, duration: 0.45, stagger: 0.06 }, 0.18);
      if (el?.querySelector("[data-hero-veil]")) {
        tl.fromTo("[data-hero-veil]", { opacity: 0.85, clipPath: "inset(0 0% 0 0)" }, { opacity: 0.85, clipPath: "inset(0 0% 0 100%)", duration: 0.6, ease: "power2.inOut" }, 0.35).set("[data-hero-veil]", { opacity: 0 });
      }
    },
    { scope: root },
  );
  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
