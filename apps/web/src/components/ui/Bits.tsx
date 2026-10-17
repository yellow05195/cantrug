"use client";
import { Check, Copy } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { age } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";

export function CopyButton({ value, label, copiedLabel, className, children }: { value: string; label: string; copiedLabel: string; className?: string; children?: React.ReactNode }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          /* clipboard blocked */
        }
      }}
      className={cn("press inline-flex items-center gap-1.5 rounded-xs text-ink-2 hover:text-ink", className)}
      aria-label={done ? copiedLabel : label}
    >
      {children}
      {done ? <Check size={14} className="text-ink" /> : <Copy size={14} />}
    </button>
  );
}

/** Relative age that keeps ticking. The server and first client render may differ by a second. */
export function Age({ ts, className }: { ts: string | number | null | undefined; className?: string }) {
  const now = useNow(5000);
  return (
    <span className={cn("num", className)} suppressHydrationWarning>
      {age(ts, now)}
    </span>
  );
}

/**
 * Coin avatar (v5 flat): a square frame, one hairline, the coin image when it
 * has one, else the ticker's first two letters in mono. `seed` is kept for
 * call-site compatibility.
 */
export function CoinAvatar({ src, symbol, size = 36, className }: { src: string | null | undefined; symbol: string; seed?: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const frame = cn("relative grid shrink-0 place-items-center overflow-hidden rounded-xs border border-line bg-bg-2", className);
  if (!src || broken) {
    return (
      <span aria-hidden className={frame} style={{ width: size, height: size }}>
        <span className={cn("num text-ink-2", size >= 56 ? "text-sm" : "text-xs")}>{(symbol || "?").slice(0, 2).toUpperCase()}</span>
      </span>
    );
  }
  return (
    <span className={frame} style={{ width: size, height: size }}>
      {/* User images come from arbitrary hosts (IPFS, Arweave, data URLs): plain <img>, fixed box, no layout shift. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setBroken(true)} className="size-full object-cover" />
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block rounded-xs bg-white/[0.04] ", className)} />;
}
