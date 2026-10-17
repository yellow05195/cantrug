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

export function CoinAvatar({ src, symbol, size = 56, className }: { src: string | null | undefined; symbol: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (!src || broken) {
    return (
      <span style={style} className={cn("grid shrink-0 place-items-center rounded-sm border border-line bg-bg-3 font-semibold text-ink-2", className)} aria-hidden>
        {symbol.slice(0, 1)}
      </span>
    );
  }
  return (
    // User-supplied images come from arbitrary hosts (IPFS, Arweave, data URLs): plain <img>, fixed box, no layout shift.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} style={style} loading="lazy" decoding="async" onError={() => setBroken(true)} className={cn("shrink-0 rounded-sm border border-line bg-bg-3 object-cover", className)} />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block rounded-sm bg-bg-3", className)} />;
}
