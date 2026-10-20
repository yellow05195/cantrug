import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Dashes } from "./Dashes";

/**
 * Board buttons: rectangular, mono caps like the labels on a trading board.
 * "primary" and "floor" are amber, "secondary" an outlined key, "light" white.
 */
export type ButtonVariant = "floor" | "floorOutline" | "primary" | "secondary" | "light" | "ghost" | "brake";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  floor: "btn-slab pill-primary",
  light: "btn-slab pill-ink",
  primary: "btn-slab pill-primary",
  floorOutline: "btn-slab border-2 border-floor/60 text-floor hover:bg-floor-dim",
  secondary: "btn-slab pill-paper",
  brake: "btn-slab border border-transparent bg-brake text-brake-ink hover:brightness-105",
  ghost: "press text-ink-2 hover:bg-card-2 hover:text-ink disabled:text-ink-3",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 gap-1.5",
  md: "h-10 px-4 gap-2",
  lg: "h-12 px-6 gap-2 !text-[13px]",
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
    "inline-flex select-none items-center justify-center whitespace-nowrap rounded-[6px] font-mono text-[12px] font-bold uppercase tracking-[0.08em] leading-none",
    "disabled:cursor-not-allowed",
    VARIANTS[variant],
    SIZES[size],
    block && "w-full",
    className,
  );
}

export function Button({ variant, size, loading, block, children, className, disabled, ...rest }: Common & Omit<ComponentProps<"button">, "children">) {
  return (
    <button type="button" {...rest} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass({ variant, size, block, className })}>
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
