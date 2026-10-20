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
 * Coin avatar: the coin image when it has one; otherwise a sticker in one of
 * the cube's six colours, picked from the mint, with the ticker's first letter.
 */
const STICKERS: [string, string][] = [
  ["#ff6a13", "#ffffff"],
  ["#12b05a", "#ffffff"],
  ["#1f5fd6", "#ffffff"],
  ["#e5322b", "#ffffff"],
  ["#ffd23f", "#1a1500"],
  ["#ffffff", "#121318"],
];
function stickerFor(key: string): [string, string] {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return STICKERS[(h >>> 0) % STICKERS.length]!;
}

export function CoinAvatar({ src, symbol, seed, size = 36, className }: { src: string | null | undefined; symbol: string; seed?: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const frame = cn("relative grid shrink-0 place-items-center overflow-hidden rounded-[28%]", className);
  if (!src || broken) {
    const [bg, fg] = stickerFor(seed ?? symbol);
    return (
      <span aria-hidden className={cn(frame, "sticker-tile border border-black/10")} style={{ width: size, height: size, background: bg, color: fg }}>
        <span className="font-display font-extrabold" style={{ fontSize: Math.round(size * 0.46) }}>
          {(symbol || "?").slice(0, 1).toUpperCase()}
        </span>
      </span>
    );
  }
  return (
    <span className={cn(frame, "ring-1 ring-black/5")} style={{ width: size, height: size }}>
      {/* User images come from arbitrary hosts (IPFS, Arweave, data URLs): plain <img>, fixed box, no layout shift. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setBroken(true)} className="size-full object-cover" />
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block rounded-xl bg-card-2", className)} />;
}
