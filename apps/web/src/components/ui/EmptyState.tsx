import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Empty and unavailable states: a quiet 16 px well with a dashed hairline. */
export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-[16px] border-2 border-dashed border-seam bg-bg-2", className)}>
      <div className="p-5 text-sm text-ink-2 sm:p-6">{children}</div>
    </div>
  );
}
