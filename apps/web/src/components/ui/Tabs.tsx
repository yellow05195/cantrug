"use client";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
  /** Orange when active (only "Redeem at floor"). */
  floor?: boolean;
  disabled?: boolean;
}

/**
 * Pill segmented control (atelier): a card-2 track, the active pill in ink on
 * the ground colour; the Redeem pill turns orange. Arrow keys move
 * between tabs (no animation on keyboard moves).
 */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  className,
  size = "md",
  idPrefix,
  fill,
  flat,
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (k: K) => void;
  className?: string;
  size?: "sm" | "md" | "lg";
  idPrefix: string;
  fill?: boolean;
  /** Inside a sticker: no outline of its own, just a recessed track (never a sticker in a sticker). */
  flat?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    for (let s = 1; s <= items.length; s++) {
      const j = (i + dir * s + items.length) % items.length;
      if (!items[j]!.disabled) {
        refs.current[j]?.focus();
        onChange(items[j]!.key);
        break;
      }
    }
  };
  return (
    <div role="tablist" className={cn("inline-flex max-w-full gap-1 rounded-[6px] bg-bg-2 p-1", !flat && "border border-line", fill && "flex w-full", className)}>
      {items.map((it, i) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${idPrefix}-tab-${it.key}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${it.key}`}
            tabIndex={active ? 0 : -1}
            disabled={it.disabled}
            onClick={() => onChange(it.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "relative whitespace-nowrap rounded-[4px] font-mono text-[12px] font-bold uppercase tracking-[0.08em] transition-[background-color,color] duration-150 ease-[var(--ease-out)] disabled:cursor-not-allowed disabled:opacity-40",
              size === "sm" ? "h-7 px-3 text-xs" : size === "lg" ? "h-11 px-4 text-md sm:text-base" : "h-9 px-4 text-sm",
              fill && "min-w-0 flex-auto truncate px-2.5",
              active
                ? it.floor
                  ? "bg-floor text-floor-ink"
                  : "bg-ink text-bg"
                : cn("hover:text-ink", it.floor ? "text-floor" : "text-ink-2"),
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ idPrefix, k, children, className }: { idPrefix: string; k: string; children: ReactNode; className?: string }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${k}`} aria-labelledby={`${idPrefix}-tab-${k}`} className={className}>
      {children}
    </div>
  );
}
