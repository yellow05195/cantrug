import type { ReactNode } from "react";

/**
 * Vector marks in the site palette. No emoji, no raster: the Solana bars,
 * the floor (a slab with its orange edge), the brake (a staircase) and the
 * sealed pool (a lock without a key).
 */
export function SolanaMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 88" className={className} aria-hidden="true">
      <path fill="currentColor" d="M20 0h80L80 18H0zM0 35h80l20 18H20zM20 70h80L80 88H0z" />
    </svg>
  );
}

export function FloorMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect x="8" y="40" width="48" height="14" rx="4" fill="#ffffff" />
      <rect x="8" y="38" width="48" height="4" rx="2" fill="var(--floor)" />
      <circle cx="32" cy="24" r="14" fill="var(--floor)" />
      <circle cx="32" cy="24" r="7" fill="none" stroke="#0b0d14" strokeWidth="3" />
    </svg>
  );
}

export function BrakeMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M6 14h16v14h16v14h20" fill="none" stroke="#ffffff" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      <rect x="6" y="11" width="16" height="4" rx="2" fill="var(--floor)" />
      <rect x="22" y="25" width="16" height="4" rx="2" fill="var(--floor)" />
      <rect x="38" y="39" width="20" height="4" rx="2" fill="var(--floor)" />
      <rect x="6" y="52" width="52" height="4" rx="2" fill="#ffffff" />
    </svg>
  );
}

export function LockMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect x="12" y="28" width="40" height="28" rx="8" fill="#ffffff" />
      <path d="M20 28v-6a12 12 0 0 1 24 0v6" fill="none" stroke="#ffffff" strokeWidth="4" />
      <circle cx="32" cy="42" r="4" fill="var(--floor)" />
    </svg>
  );
}

/** A floating token: a dark disc with a hairline, a small label under it. */
export function TokenBadge({ mark, label }: { mark: ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-line-2 bg-card-2">{mark}</div>
      <span className="num rounded-full border border-line-2 bg-card-2 px-2.5 py-1 text-[11px] text-ink-2">{label}</span>
    </div>
  );
}
