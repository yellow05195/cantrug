import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Empty and unavailable states: a dashed outline, nothing else. */
export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-dashed border-stroke bg-bg-2", className)}>
      <div className="relative p-5 text-sm text-ink-2 sm:p-6">{children}</div>
    </div>
  );
}
