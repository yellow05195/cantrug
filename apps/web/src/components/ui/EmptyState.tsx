import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Empty and unavailable states sit on the drafting grid: a dashed outline over `blueprint-grid`. */
export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl border-2 border-dashed border-stroke bg-bg-2", className)}>
      <div aria-hidden className="blueprint-grid absolute inset-0 opacity-70" />
      <div className="relative p-5 text-sm text-ink-2 sm:p-6">{children}</div>
    </div>
  );
}
