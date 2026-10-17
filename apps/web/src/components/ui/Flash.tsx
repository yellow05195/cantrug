"use client";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A number that holds its direction color for a beat when it changes
 * (DESIGN.md v2 motion 4). Remounting the span restarts the CSS animation.
 */
export function Flash({ value, children, className }: { value: number; children: ReactNode; className?: string }) {
  const [state, setState] = useState({ prev: value, dir: 0, n: 0 });
  if (value !== state.prev) {
    setState({ prev: value, dir: value > state.prev ? 1 : -1, n: state.n + 1 });
  }
  return (
    <span key={state.n} className={cn(state.n > 0 && (state.dir > 0 ? "flash-up" : "flash-down"), className)}>
      {children}
    </span>
  );
}
