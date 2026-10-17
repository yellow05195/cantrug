"use client";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/** DESIGN.md motion constants. */
export const MOTION = {
  pour: 0.9,
  fillFade: 0.3,
  flap: 0.24,
  bannerIn: 0.32,
  bannerOut: 0.2,
} as const;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export { gsap, useGSAP };
