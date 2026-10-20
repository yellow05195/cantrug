"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * One split-flap tile. When its character changes, the old top half folds
 * down and the new bottom half falls into place (150 ms each), like a
 * station board. Reduced motion: the character just changes.
 */
function Flap({ ch }: { ch: string }) {
  const [s, setS] = useState({ cur: ch, prev: ch, n: 0 });
  if (s.cur !== ch) setS({ cur: ch, prev: s.cur, n: s.n + 1 });
  const show = ch === " " ? " " : ch;
  return (
    <span className="flap" aria-hidden data-blank={ch === " " ? "" : undefined}>
      <span className="flap-top">{show}</span>
      <span className="flap-bottom">{show}</span>
      {s.n > 0 ? (
        <>
          <span key={`t${s.n}`} className="flap-fold-top">
            {s.prev === " " ? " " : s.prev}
          </span>
          <span key={`b${s.n}`} className="flap-fold-bottom">
            {show}
          </span>
        </>
      ) : null}
    </span>
  );
}

/** A row of tiles. `width` pads or cuts the text so columns line up. */
export function SplitFlap({ text, width, align = "left", className, label }: { text: string; width?: number; align?: "left" | "right"; className?: string; label?: string }) {
  let t = text.toUpperCase();
  if (width !== undefined) t = t.length > width ? t.slice(0, width) : align === "right" ? t.padStart(width, " ") : t.padEnd(width, " ");
  return (
    <span className={cn("flaps", className)} role="text" aria-label={label ?? text}>
      {Array.from(t).map((c, i) => (
        <Flap key={i} ch={c} />
      ))}
    </span>
  );
}
