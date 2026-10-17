import { cn } from "@/lib/cn";

/**
 * The emblem: a round concrete badge with a cream rim, the orange floor line
 * across it, and a stack of SOL coins standing on the floor. Flat fills with
 * drawn highlights, so it can appear several times on a page.
 */
export function LogoMark({ size = 24, className, title }: { size?: number; className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={cn("shrink-0", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {/* ground shadow */}
      <ellipse cx="32" cy="60" rx="18" ry="3" fill="#1d1e22" opacity="0.16" />
      {/* badge */}
      <circle cx="32" cy="31" r="27" fill="#9a9ea6" />
      <circle cx="32" cy="31" r="27" fill="none" stroke="#f6f5f2" strokeWidth="3" />
      {/* sky half, lighter */}
      <path d="M7.5 31a24.5 24.5 0 0 1 49 0z" fill="#c9ccd1" />
      {/* gloss sweep */}
      <path d="M12 22q20-14 40 0q-3-9-20-11T12 22z" fill="#ffffff" opacity="0.55" />
      {/* ground below the floor */}
      <path d="M7.5 36h49a24.5 24.5 0 0 1-49 0z" fill="#6d7178" />
      {/* the floor line */}
      <rect x="8" y="33" width="48" height="5" fill="#ee5a1c" />
      {/* the coin stack, wide enough to read at 24 px */}
      <ellipse cx="32" cy="31" rx="12" ry="4" fill="#b8400e" />
      <rect x="20" y="23" width="24" height="8" fill="#ee5a1c" />
      <ellipse cx="32" cy="23" rx="12" ry="4" fill="#ff7a3d" />
      <rect x="20" y="15" width="24" height="8" fill="#ee5a1c" />
      <ellipse cx="32" cy="15" rx="12" ry="4" fill="#ff7a3d" />
      <ellipse cx="32" cy="15" rx="5.5" ry="1.8" fill="#ffb48a" />
    </svg>
  );
}

/** Emblem + two-tone wordmark in the display face. */
export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display font-semibold tracking-tight text-ink", className)}>
      <LogoMark size={size} />
      <span className="leading-none">
        FLOOR<span className="text-floor">ED</span>
      </span>
    </span>
  );
}
