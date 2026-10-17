import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A plate (house style): night glass, one hairline, a whisper of light on the
 * top edge, 20 px radius. `interactive` adds the hover tint and press dip.
 * The name stays `Sticker` so existing call sites keep working.
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
  neutral: "border-line-2 bg-white/[0.03] text-ink-2",
  floor: "border-floor/40 bg-floor-dim text-floor",
  brake: "border-brake/50 bg-brake/10 text-brake",
  up: "border-up/40 bg-up-soft text-up",
  down: "border-down/40 bg-down-soft text-down",
  solid: "border-transparent bg-floor text-floor-ink",
};

/** Tags and chips: hairline pills, sentence case. */
export function Chip({ tone = "neutral", className, children, title }: { tone?: ChipTone; className?: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 whitespace-nowrap border px-2 py-0.5 text-xs font-medium leading-4", TONES[tone], className)}>
      {children}
    </span>
  );
}
