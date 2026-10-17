import { cn } from "@/lib/cn";

/** The F standing on its orange slab (assets/logo/floored-mark.svg). Ink follows currentColor. */
export function LogoMark({ size = 24, className, title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={cn("shrink-0", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect x="4" y="52" width="56" height="8" fill="var(--floor)" />
      <path fill="currentColor" d="M14 6h36v10H26v10h20v10H26v16H14z" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={24} />
      <span className="text-[15px] font-bold tracking-[0.06em]">FLOORED</span>
    </span>
  );
}
