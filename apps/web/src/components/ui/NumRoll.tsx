"use client";
import { useRef } from "react";
import { cn } from "@/lib/cn";
import { MOTION, gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * Split-flap counter (DESIGN.md motion 2). Every digit is a vertical strip of
 * 0-9 in a 1ch cell, so widths never change while it rolls. Only the digits
 * that changed move: 240 ms, power3.out. Reduced motion: digits jump.
 * The server render already shows the right digits (inline transform).
 */
export function NumRoll({ value, className, label, rollFrom }: { value: string; className?: string; label?: string; rollFrom?: string | null }) {
  const root = useRef<HTMLSpanElement>(null);
  // `rollFrom`: pour in from these digits on mount (hero entrance), otherwise start settled.
  const prev = useRef<string>(rollFrom ?? value);
  const pouring = useRef(Boolean(rollFrom));

  useGSAP(
    () => {
      const el = root.current;
      if (!el) return;
      const before = prev.current;
      prev.current = value;
      if (before === value) return;
      const cols = el.querySelectorAll<HTMLElement>("[data-col]");
      const reduce = prefersReducedMotion();
      // Align from the right so "9.99" → "10.00" rolls the right digits.
      const offset = value.length - before.length;
      cols.forEach((col) => {
        const i = Number(col.dataset.i);
        const next = Number(col.dataset.d);
        const old = before[i - offset];
        if (old === value[i]) return;
        const from = old !== undefined && /\d/.test(old) ? Number(old) : next;
        // `y: 0` discards the px offset GSAP would parse from the CSS transform.
        if (reduce || from === next) {
          gsap.set(col, { y: 0, yPercent: -next * 10 });
          return;
        }
        const pour = pouring.current;
        gsap.fromTo(
          col,
          { y: 0, yPercent: -from * 10 },
          { y: 0, yPercent: -next * 10, duration: pour ? 0.7 : MOTION.flap, delay: pour ? 0.25 + i * 0.04 : 0, ease: "power3.out", overwrite: true },
        );
      });
      pouring.current = false;
    },
    { dependencies: [value], scope: root },
  );

  return (
    <span ref={root} className={cn("num inline-flex items-baseline leading-none", className)}>
      <span className="sr-only">{label ?? value}</span>
      {value.split("").map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} aria-hidden className="relative inline-block h-[1em] w-[1ch] overflow-hidden leading-none">
            <span data-col data-i={i} data-d={ch} className="absolute inset-x-0 top-0 block [transform:translateY(calc(var(--d)*-10%))]" style={{ ["--d" as string]: ch }}>
              {DIGITS.map((d) => (
                <span key={d} className="block h-[1em] leading-none">
                  {d}
                </span>
              ))}
            </span>
          </span>
        ) : (
          <span key={i} aria-hidden className={cn("inline-block leading-none", ch === " " ? "w-[0.35ch]" : "")}>
            {ch === " " ? " " : ch}
          </span>
        ),
      )}
    </span>
  );
}
