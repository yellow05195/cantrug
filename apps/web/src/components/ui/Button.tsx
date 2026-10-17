import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Dashes } from "./Dashes";

export type ButtonVariant = "floor" | "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  floor: "bg-floor text-floor-ink hover:brightness-110 disabled:bg-floor/40",
  primary: "bg-ink text-bg hover:bg-ink/90 disabled:bg-ink/30",
  secondary: "border border-line-2 text-ink hover:border-ink-3 hover:bg-bg-3 disabled:text-ink-3",
  ghost: "text-ink-2 hover:text-ink hover:bg-bg-3 disabled:text-ink-3",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-md gap-2",
  lg: "h-12 px-5 text-base gap-2",
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
    "press inline-flex select-none items-center justify-center whitespace-nowrap rounded-sm font-medium",
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
