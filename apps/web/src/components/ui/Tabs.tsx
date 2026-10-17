"use client";
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
  /** Orange tab (only "Redeem at floor"). */
  floor?: boolean;
  disabled?: boolean;
}

/** Underlined tabs on a 1 px rule. Arrow keys move between tabs. */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  className,
  size = "md",
  idPrefix,
  fill,
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (k: K) => void;
  className?: string;
  size?: "sm" | "md";
  idPrefix: string;
  fill?: boolean;
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
    <div role="tablist" className={cn("flex border-b border-line", className)}>
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
              "relative -mb-px whitespace-nowrap border-b-2 px-3 font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40",
              size === "sm" ? "h-9 text-sm" : "h-11 text-md",
              fill && "flex-1",
              active
                ? it.floor
                  ? "border-floor text-floor"
                  : "border-ink text-ink"
                : cn("border-transparent hover:text-ink", it.floor ? "text-floor/80" : "text-ink-2"),
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
