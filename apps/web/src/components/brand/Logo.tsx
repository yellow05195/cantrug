import { cn } from "@/lib/cn";

/*
 * The mark is one tile of the board: a split-flap tile showing an F, the
 * hinge across its middle, and the amber floor under it.
 */
export function LogoMark({ size = 24, className, title }: { size?: number; className?: string; title?: string; plain?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={cn("shrink-0", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect x="4" y="2" width="56" height="52" rx="7" fill="#23231f" />
      <path d="M4 28h56v19a7 7 0 0 1-7 7H11a7 7 0 0 1-7-7z" fill="#171714" />
      <path d="M22 13h22v7H30v6h12v7H30v12h-8z" fill="#f3efe4" />
      <rect x="4" y="27.5" width="56" height="1.6" fill="#0b0b0a" />
      <rect x="2" y="57" width="60" height="5" rx="1.5" fill="#ffad1f" />
    </svg>
  );
}

/** Mark + wordmark in the board's display face. */
export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display text-[22px] font-extrabold uppercase leading-none tracking-[0.03em] text-ink", className)}>
      <LogoMark size={size} />
      <span>Floored</span>
    </span>
  );
}
