import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A sticker on wet concrete: 12 px radius, 2 px stroke, solid offset shadow.
 * `interactive` adds the hover lift and press squash (gated to fine pointers).
 */
export function Sticker({ className, interactive, as: As = "div", children, ...rest }: { className?: string; interactive?: boolean; as?: "div" | "section" | "article" | "aside"; children: ReactNode } & Omit<ComponentProps<"div">, "ref">) {
  return (
    <As className={cn("sticker", interactive && "lift", className)} {...rest}>
      {children}
    </As>
  );
}

export type ChipTone = "neutral" | "floor" | "brake" | "up" | "down" | "solid";

const TONES: Record<ChipTone, string> = {
  neutral: "border-stroke bg-bg-3 text-ink-2",
  floor: "border-floor/50 bg-floor-dim text-floor",
  brake: "border-brake-ink bg-brake text-brake-ink",
  up: "border-up/40 bg-up/10 text-up",
  down: "border-down/40 bg-down/10 text-down",
  solid: "border-floor-deep bg-floor text-floor-ink",
};

/** Tags and chips: the only 999 px radius in the system. */
export function Chip({ tone = "neutral", className, children, title }: { tone?: ChipTone; className?: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border-2 px-2.5 py-0.5 text-xs font-semibold leading-4", TONES[tone], className)}>
      {children}
    </span>
  );
}
