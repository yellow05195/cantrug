"use client";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { countdown, pct, tokens } from "@/lib/format";
import { MOTION, gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import { useNow } from "@/lib/hooks/useNow";

export interface BrakeInfo {
  engaged: boolean;
  queued: bigint;
  supply: bigint;
  /** Unix ms when the current window closes. */
  windowEndsAt: number | null;
}

/**
 * The brake banner (DESIGN.md motion 3): slides down from under the header
 * (320 ms power3.out) with a 2-frame 1 px shiver, stripes crawl at 40 s per
 * loop while engaged, leaves with a 200 ms slide up. Reduced motion: it simply
 * appears and the stripes stay still.
 */
export function BrakeBanner({ info, onExit, exitLabel, exitDisabled }: { info: BrakeInfo; onExit: () => void; exitLabel?: string; exitDisabled?: boolean }) {
  const [shown, setShown] = useState(info.engaged);
  const [last, setLast] = useState(info);
  if (info.engaged && !shown) setShown(true);
  if (info.engaged && info !== last) setLast(info);
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const wasEngaged = useRef(false);

  useGSAP(
    () => {
      const el = inner.current;
      if (!el || !shown) return;
      const reduce = prefersReducedMotion();
      if (info.engaged && !wasEngaged.current) {
        wasEngaged.current = true;
        if (reduce) {
          gsap.set(el, { yPercent: 0, x: 0 });
          return;
        }
        gsap
          .timeline()
          .fromTo(el, { yPercent: -100 }, { yPercent: 0, duration: MOTION.bannerIn, ease: "power3.out" })
          .to(el, { x: 1, duration: 1 / 60, ease: "none" })
          .to(el, { x: -1, duration: 1 / 60, ease: "none" })
          .set(el, { x: 0 });
      } else if (!info.engaged && wasEngaged.current) {
        wasEngaged.current = false;
        if (reduce) {
          setShown(false);
          return;
        }
        gsap.to(el, { yPercent: -100, duration: MOTION.bannerOut, ease: "power2.in", onComplete: () => setShown(false) });
      }
    },
    { dependencies: [info.engaged, shown], scope: wrap },
  );

  if (!shown) return null;
  const view = info.engaged ? info : last;
  return (
    <div ref={wrap} className="overflow-hidden" role="status" aria-live="polite">
      <div ref={inner}>
        <BrakeBody info={view} onExit={onExit} exitLabel={exitLabel} exitDisabled={exitDisabled} />
      </div>
    </div>
  );
}

function BrakeBody({ info, onExit, exitLabel, exitDisabled }: { info: BrakeInfo; onExit: () => void; exitLabel?: string; exitDisabled?: boolean }) {
  const t = useTranslations("brake");
  const now = useNow(1000);
  const secs = info.windowEndsAt ? Math.max(0, (info.windowEndsAt - now) / 1000) : null;
  const share = info.supply > 0n ? Number((info.queued * 1_000_000n) / info.supply) / 10_000 : 0;
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pt-4 sm:px-6">
      <div className="well border-l-4 border-l-brake">
      <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <p className="max-w-[80ch] text-sm leading-relaxed text-ink-2 md:text-md">
          <span className="kicker mr-2 text-[color-mix(in_oklab,var(--brake)_62%,var(--ink))]">{t("engaged")}</span>
          {secs !== null ? (
            <>
              {t("closesIn")} <span className="num inline-block min-w-[4ch] whitespace-nowrap font-medium text-[color-mix(in_oklab,var(--brake)_62%,var(--ink))]" suppressHydrationWarning>{countdown(secs)}</span>.{" "}
            </>
          ) : null}
          {t("queued", { tokens: tokens(info.queued), pct: pct(share) })} {t("proRata")}
        </p>
        <Button variant="floor" size="md" onClick={onExit} disabled={exitDisabled} className="shrink-0 self-start md:self-auto">
          {exitLabel ?? t("exit")}
        </Button>
      </div>
      </div>
    </div>
  );
}
