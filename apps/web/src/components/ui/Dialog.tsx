"use client";
import { X } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Native <dialog> (focus trap, Esc, inert background for free). Centered
 * modal on desktop, bottom sheet under 640 px. Enter: opacity + 0.97 scale /
 * slide, 200 ms strong ease-out; exit is instant.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
  closeLabel = "Close",
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  dismissable?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissable) onClose();
      }}
      onClick={(e) => {
        if (dismissable && e.target === ref.current) onClose();
      }}
      className={cn(
        "fl-dialog m-0 w-full max-w-none bg-card p-0 text-ink backdrop:bg-[color-mix(in_oklab,var(--ink)_45%,transparent)]",
        "max-sm:mt-auto max-sm:rounded-t-[24px] sm:m-auto sm:w-[min(460px,calc(100vw-32px))] sm:rounded-[24px]",
        className,
      )}
    >
      {open ? (
        <div className="max-h-[85dvh] overflow-y-auto p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          <span aria-hidden className="mx-auto -mt-2 mb-3 block h-1.5 w-12 rounded-full bg-line sm:hidden" />
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 className="text-xl">{title}</h2>
            {dismissable ? (
              <button type="button" onClick={onClose} className="press -mr-1 -mt-1 grid size-9 place-items-center rounded-full border-[1.5px] border-seam text-ink-2 hover:text-ink" aria-label={closeLabel}>
                <X size={16} />
              </button>
            ) : null}
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
