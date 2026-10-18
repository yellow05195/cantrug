"use client";
import { CaretLeft, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRef } from "react";
import { Reveal } from "@/components/layout/Reveal";
import { Age, CoinAvatar } from "@/components/ui/Bits";
import { FloorBadge, gapText } from "@/components/ui/Floor";
import { Price } from "@/components/ui/Num";
import { Scene } from "@/components/ui/Scene";
import { Chip } from "@/components/ui/Sticker";
import type { CoinJson } from "@/lib/api/types";
import { metricsFromJson } from "@/lib/coin/metrics";
import { pct } from "@/lib/format";
import { useLiveCoins } from "@/lib/live/patch";

/**
 * Latest on the floor: a horizontal row of coin cards, each with its own
 * little drawn city. Scrolls sideways; arrows on desktop, swipe on phones.
 */
export function LatestCoins({ coins }: { coins: CoinJson[] }) {
  const t = useTranslations("home.latest");
  const tc = useTranslations("coin");
  const tf = useTranslations("floor");
  const live = useLiveCoins(coins);
  const list = useRef<HTMLUListElement>(null);
  const by = (dx: number) => list.current?.scrollBy({ left: dx, behavior: "smooth" });
  if (!live.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-3 pt-16 md:px-6">
      <Reveal>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <p className="kicker">{t("kicker")}</p>
            <h2 className="mt-2 text-2xl sm:text-3xl">{t("title")}</h2>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <button type="button" onClick={() => by(-520)} aria-label={t("prev")} className="press grid size-10 place-items-center rounded-full border-2 border-seam bg-card text-ink transition-colors hover:border-floor">
              <CaretLeft size={16} weight="bold" />
            </button>
            <button type="button" onClick={() => by(520)} aria-label={t("next")} className="press grid size-10 place-items-center rounded-full border-2 border-seam bg-card text-ink transition-colors hover:border-floor">
              <CaretRight size={16} weight="bold" />
            </button>
          </div>
        </div>
      </Reveal>
      <Reveal delay={80}>
        <ul ref={list} className="no-scrollbar -mx-3 flex snap-x gap-4 overflow-x-auto px-3 pb-2 md:mx-0 md:px-0">
          {live.map((c) => {
            const m = metricsFromJson(c);
            const graduated = m.phase === "graduated";
            return (
              <li key={c.mint} className="w-[240px] flex-none snap-start">
                <Link href={`/coin/${c.mint}`} prefetch={false} className="lift block overflow-hidden rounded-3xl border border-seam bg-card shadow-[0_10px_40px_-12px_var(--shadow)]">
                  <div className="relative">
                    <Scene seed={c.mint} variant={graduated ? "floor" : "site"} w={96} h={44} className="h-24" />
                    <div className="absolute -bottom-5 left-4 rounded-full border-4 border-card">
                      <CoinAvatar src={c.image_url} symbol={c.symbol} seed={c.mint} size={44} />
                    </div>
                    {c.brake.engaged ? (
                      <Chip tone="brake" className="absolute right-3 top-3 px-2 py-0 text-[11px]">
                        {tc("brakeTag")}
                      </Chip>
                    ) : null}
                  </div>
                  <div className="px-4 pb-4 pt-7">
                    <p className="truncate font-display text-base font-semibold text-ink">{c.name || tc("unnamed")}</p>
                    <p className="mt-0.5 flex items-center gap-2 font-mono text-xs text-ink-2">
                      <span className="text-ink">${c.symbol}</span>
                      {c.created_at ? <Age ts={c.created_at} className="text-ink-3" /> : null}
                    </p>
                    <div className="mt-3 flex items-end justify-between gap-2 border-t border-dashed border-seam pt-3">
                      <Price value={m.priceSol} className="text-md font-medium" />
                      {graduated ? <FloorBadge floorSol={m.floorSol} active /> : <span className="num text-xs text-ink-3">{pct(m.progress * 100)} %</span>}
                    </div>
                    <p className="num mt-2 text-xs text-ink-2">{graduated ? gapText(tf, m.gapPct) : t("toGrad")}</p>
                  </div>
                </Link>
              </li>
            );
          })}
          <li className="w-[240px] flex-none snap-start">
            <Link href="/create" className="lift flex h-full min-h-[232px] flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-seam p-6 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-floor font-display text-2xl font-bold text-floor-ink">+</span>
              <span className="font-display text-base font-semibold text-ink">{t("mintYours")}</span>
              <span className="text-xs text-ink-2">{t("mintNote")}</span>
            </Link>
          </li>
        </ul>
      </Reveal>
    </section>
  );
}
