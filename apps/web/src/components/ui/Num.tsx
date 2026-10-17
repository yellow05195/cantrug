import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { tinyParts } from "@/lib/format";

/** Mono tabular number with an optional unit in secondary ink. */
export function Num({ children, unit, className, unitClassName }: { children: ReactNode; unit?: ReactNode; className?: string; unitClassName?: string }) {
  return (
    <span className={cn("num whitespace-nowrap", className)}>
      {children}
      {unit ? <span className={cn("ml-1 text-ink-3", unitClassName)}>{unit}</span> : null}
    </span>
  );
}

/** A tiny SOL price in trader notation: 0.0₇2812, with a real subscript for the zero count. */
export function Price({ value, sig = 4, className, unit }: { value: number; sig?: number; className?: string; unit?: ReactNode }) {
  const p = tinyParts(value, sig);
  const label = value > 0 ? value.toPrecision(sig) : "0";
  return (
    <Num className={className} unit={unit}>
      <span aria-label={label}>
        {p.zeros ? (
          <>
            {p.lead}
            <sub className="relative -bottom-[0.15em] text-[0.7em] leading-none">{p.zeros}</sub>
            {p.digits}
          </>
        ) : (
          p.lead
        )}
      </span>
    </Num>
  );
}
