"use client";
import { Check, Copy } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { age } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { BuildingAvatar } from "@/components/coin/BuildingAvatar";

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
      className={cn("press inline-flex items-center gap-1.5 rounded-sm text-ink-2 hover:text-ink", className)}
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

export function CoinAvatar({ src, symbol, seed, size = 56, className }: { src: string | null | undefined; symbol: string; seed?: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const radius = size >= 40 ? "rounded-xl" : "rounded-md";
  if (!src || broken) return <BuildingAvatar seed={seed ?? symbol} size={size} className={cn(radius, className)} />;
  return (
    <span className={cn("relative block shrink-0 overflow-hidden border border-stroke bg-bg-3", radius, className)} style={{ width: size, height: size }}>
      {/* User images come from arbitrary hosts (IPFS, Arweave, data URLs): plain <img>, fixed box, no layout shift. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setBroken(true)} className="size-full object-cover" />
      <span aria-hidden className="absolute inset-x-[8%] bottom-[5%] h-[6%] min-h-[2px] rounded-[1px] bg-floor" />
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block rounded-xl bg-bg-3", className)} />;
}
