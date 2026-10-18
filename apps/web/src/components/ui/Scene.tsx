"use client";
import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { sceneDataUri, type SceneVariant } from "@/lib/art/scene";
import { useIsDark } from "@/lib/theme";

/** Picks the subject from the seed when none is given, so pages get the right picture by name. */
function guess(seed: string): SceneVariant {
  const s = seed.toLowerCase();
  if (s.includes("brake") || s.includes("challenge")) return "brake";
  if (s.includes("floor") || s.includes("how")) return "floor";
  if (s.includes("vault") || s.includes("keys") || s.includes("verify")) return "vault";
  return "chart";
}

/** A drawn pixel scene about the product that follows the day/night theme. */
export function Scene({ seed, variant, w = 200, h = 78, density, className }: { seed: string; variant?: SceneVariant; w?: number; h?: number; density?: "calm" | "busy"; className?: string }) {
  const dark = useIsDark();
  const v = variant ?? guess(seed);
  const src = useMemo(() => sceneDataUri({ seed, mood: dark ? "night" : "day", variant: v, w, h, density }), [seed, dark, v, w, h, density]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" aria-hidden className={cn("pixelated block w-full object-cover object-bottom", className)} />;
}
