import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A plate (atelier): the card surface with one hairline and a soft shadow,
 * 22 px radius. `interactive` adds the hover lift. The name stays `Sticker`
 * so existing call sites keep working.
 */
export function Sticker({ className, interactive, as: As = "div", children, ...rest }: { className?: string; interactive?: boolean; as?: "div" | "section" | "article" | "aside"; children: ReactNode } & Omit<ComponentProps<"div">, "ref">) {
  return (
    <As className={cn("plate", interactive && "lift", className)} {...rest}>
      {children}
    </As>
  );
}

export type ChipTone = "neutral" | "floor" | "brake" | "up" | "down" | "solid";

const TONES: Record<ChipTone, string> = {
  neutral: "border-seam bg-card text-ink-2",
  floor: "border-floor/40 bg-floor-dim text-floor",
  brake: "border-brake/60 bg-brake/15 text-[color-mix(in_oklab,var(--brake)_62%,var(--ink))]",
  up: "border-up/40 bg-up-soft text-up",
  down: "border-down/40 bg-down-soft text-down",
  solid: "border-transparent bg-floor text-floor-ink",
};

/** Tags and chips: round pills with the seam, sentence case. */
export function Chip({ tone = "neutral", className, children, title }: { tone?: ChipTone; className?: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-[3px] border px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.06em] leading-4", TONES[tone], className)}>
      {children}
    </span>
  );
}
