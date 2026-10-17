import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Dashes } from "./Dashes";

/**
 * v2 buttons: 10 px radius, 2 px stroke, solid slab shadow that lifts on hover
 * and squashes on press. Orange is the primary CTA and Redeem; nothing else.
 */
export type ButtonVariant = "floor" | "floorOutline" | "primary" | "secondary" | "ghost" | "brake";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  floor: "btn-slab border-2 border-floor-deep bg-floor text-floor-ink [--btn-shadow:var(--floor-deep)] hover:bg-floor-hot disabled:opacity-45",
  primary: "btn-slab border-2 border-floor-deep bg-floor text-floor-ink [--btn-shadow:var(--floor-deep)] hover:bg-floor-hot disabled:opacity-45",
  floorOutline: "btn-slab border-2 border-floor/60 bg-floor-dim text-floor [--btn-shadow:var(--floor-deep)] hover:border-floor disabled:opacity-45",
  secondary: "btn-slab border-2 border-stroke bg-surface text-ink hover:border-stroke-strong disabled:text-ink-3",
  brake: "btn-slab border-2 border-brake-ink bg-brake-ink text-brake [--btn-shadow:#000]",
  ghost: "press text-ink-2 hover:bg-bg-3 hover:text-ink disabled:text-ink-3",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5",
  md: "h-11 px-4 text-md gap-2",
  lg: "h-13 px-6 text-base gap-2",
};

interface Common {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  block?: boolean;
  children: ReactNode;
  className?: string;
}

export function buttonClass({ variant = "primary", size = "md", block, className }: Omit<Common, "children" | "loading">) {
  return cn(
    "inline-flex select-none items-center justify-center whitespace-nowrap rounded-lg font-semibold",
    "disabled:cursor-not-allowed",
    VARIANTS[variant],
    SIZES[size],
    block && "w-full",
    className,
  );
}

export function Button({ variant, size, loading, block, children, className, disabled, ...rest }: Common & Omit<ComponentProps<"button">, "children">) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, block, className })}
    >
      {loading ? <Dashes /> : children}
    </button>
  );
}

export function ButtonLink({ variant, size, block, children, className, href, ...rest }: Omit<Common, "loading"> & ComponentProps<typeof Link>) {
  return (
    <Link href={href} {...rest} className={buttonClass({ variant, size, block, className })}>
      {children}
    </Link>
  );
}
