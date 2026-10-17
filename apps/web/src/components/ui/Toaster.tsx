"use client";
import { ArrowSquareOut, CheckSquare, WarningDiamond, X } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  title: string;
  body?: string;
  href?: string;
  hrefLabel?: string;
  /** Orange title for floor outcomes ("Redeemed 0.4812 SOL"). */
  floor?: boolean;
}

let toasts: Toast[] = [];
let seq = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(t: Omit<Toast, "id">): number {
  const id = seq++;
  toasts = [...toasts.slice(-3), { ...t, id }];
  emit();
  return id;
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function useToasts() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
    () => toasts,
  );
}

function ToastItem({ t, closeLabel }: { t: Toast; closeLabel: string }) {
  useEffect(() => {
    let remaining = t.kind === "error" ? 9000 : 6500;
    let start = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => dismissToast(t.id), remaining);
    // Pause while the tab is hidden.
    const onVis = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
        timer = null;
        remaining -= Date.now() - start;
      } else if (!timer) {
        start = Date.now();
        timer = setTimeout(() => dismissToast(t.id), Math.max(1500, remaining));
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [t.id, t.kind]);

  const Icon = t.kind === "error" ? WarningDiamond : CheckSquare;
  return (
    <li className="fl-toast sticker pointer-events-auto flex w-full items-start gap-3 p-3 sm:w-[360px]" role={t.kind === "error" ? "alert" : "status"}>
      <Icon size={20} className={cn("mt-px shrink-0", t.kind === "error" ? "text-down" : t.floor ? "text-floor" : "text-ink-2")} />
      <div className="min-w-0 flex-1">
        <p className={cn("text-md font-medium", t.floor && "text-floor")}>{t.title}</p>
        {t.body ? <p className="mt-0.5 text-sm text-ink-2">{t.body}</p> : null}
        {t.href ? (
          <a href={t.href} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-sm text-ink-2 underline decoration-line-2 underline-offset-2 hover:text-ink">
            {t.hrefLabel}
            <ArrowSquareOut size={14} />
          </a>
        ) : null}
      </div>
      <button type="button" onClick={() => dismissToast(t.id)} className="press -m-1 grid size-7 shrink-0 place-items-center rounded-sm text-ink-3 hover:text-ink" aria-label={closeLabel}>
        <X size={14} />
      </button>
    </li>
  );
}

export function Toaster({ closeLabel }: { closeLabel: string }) {
  const list = useToasts();
  return (
    <ol
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[90] flex flex-col gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 lg:bottom-6"
    >
      {list.map((t) => (
        <ToastItem key={t.id} t={t} closeLabel={closeLabel} />
      ))}
    </ol>
  );
}
