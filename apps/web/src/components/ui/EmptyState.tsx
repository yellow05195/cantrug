import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Empty and unavailable states: a quiet well with a dashed hairline. */
export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xs border border-dashed border-line-2 bg-bg-2/60", className)}>
      <div className="p-5 text-sm text-ink-2 sm:p-6">{children}</div>
    </div>
  );
}
