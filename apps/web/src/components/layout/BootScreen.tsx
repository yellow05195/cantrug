"use client";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/Logo";

/*
 * First-visit boot screen (Plush Pons): the floor gets poured while the site
 * loads. Shows once per tab, fades out on its own, Escape or a click skips it.
 */
const STEPS = ["pour", "level", "brake", "keys", "open"] as const;

export function BootScreen() {
  const t = useTranslations("boot");
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let seen = true;
    try {
      seen = sessionStorage.getItem("floored-booted") === "1";
    } catch {
      seen = false;
    }
    if (seen || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let started = 0;
    const total = 2000;
    let raf = 0;
    const finish = () => {
      try {
        sessionStorage.setItem("floored-booted", "1");
      } catch {
        /* no storage: the screen simply shows again */
      }
      setShow(false);
      document.body.style.overflow = "";
    };
    const tick = (now: number) => {
      const p = Math.min(1, (now - started) / total);
      setProgress(p);
      setStep(Math.min(STEPS.length - 1, Math.floor(p * STEPS.length)));
      if (p < 1) raf = requestAnimationFrame(tick);
      else finish();
    };
    raf = requestAnimationFrame((now0) => {
      setShow(true);
      document.body.style.overflow = "hidden";
      started = now0;
      raf = requestAnimationFrame(tick);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cancelAnimationFrame(raf);
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, []);

  if (!show) return null;
  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-bg"
      role="status"
      aria-live="polite"
      onClick={() => {
        try {
          sessionStorage.setItem("floored-booted", "1");
        } catch {
          /* ignore */
        }
        setShow(false);
        document.body.style.overflow = "";
      }}
    >
      <div className="flex w-[min(320px,80vw)] flex-col items-center gap-5">
        <div className="huggable">
          <LogoMark size={56} />
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full border border-seam bg-card">
          <div className="h-full rounded-full bg-floor transition-[width] duration-100" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ink-2">{t(`steps.${STEPS[step] ?? "pour"}`)}</p>
        <p className="text-xs text-ink-3">{t("skip")}</p>
      </div>
    </div>
  );
}
