"use client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo } from "react";
import { Reveal } from "@/components/layout/Reveal";
import type { CoinJson } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { metricsFromJson } from "@/lib/coin/metrics";
import { pct, solCompact } from "@/lib/format";
import { useLiveCoins } from "@/lib/live/patch";

/*
 * Today's face: nine live coins on one face of the cube. Each sticker's
 * colour is the coin's state, the legend says which.
 */
type Tone = "blue" | "white" | "orange" | "green" | "yellow";
const BG: Record<Tone, string> = {
  blue: "bg-cube-blue text-white",
  white: "bg-cube-white text-ink",
  orange: "bg-cube-orange text-white",
  green: "bg-cube-green text-white",
  yellow: "bg-cube-yellow text-[#1a1500]",
};

function toneOf(c: CoinJson): Tone {
  const m = metricsFromJson(c);
  if (c.brake.engaged) return "yellow";
  if (m.phase === "graduated") return (m.gapPct ?? 0) >= 100 ? "green" : "orange";
  const ageMs = c.created_at ? Date.now() - new Date(c.created_at).getTime() : Infinity;
  return ageMs < 3_600_000 ? "blue" : "white";
}

export function LiveFace({ coins }: { coins: CoinJson[] }) {
  const t = useTranslations("home.face");
  const picked = useMemo(() => {
    const seen = new Set<string>();
    return coins.filter((c) => !seen.has(c.mint) && seen.add(c.mint)).slice(0, 9);
  }, [coins]);
  const live = useLiveCoins(picked);
  if (live.length < 9) return null;
  const legend: Tone[] = ["green", "orange", "white", "blue", "yellow"];

  return (
    <section id="coins" className="scroll-mt-16 bg-cube-green text-ink">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <Reveal>
          <p className="text-sm font-semibold text-ink/70">{t("kicker")}</p>
          <h2 className="mt-3 text-[clamp(34px,4.6vw,60px)]">{t("title")}</h2>
          <p className="mt-4 max-w-[46ch] text-[17px] font-medium leading-relaxed text-ink/80">{t("lede")}</p>
          <ul className="mt-6 grid gap-2.5 text-[15px] font-medium text-ink/85">
            {legend.map((k) => (
              <li key={k} className="flex items-center gap-3">
                <span className="rounded-[7px] bg-cube-body p-[3px]" aria-hidden>
                  <span className={cn("sticker-tile block size-5 rounded-[5px]", BG[k])} />
                </span>
                {t(`legend.${k}`)}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={80}>
          <div className="cube-face mx-auto w-full max-w-[560px]">
            {live.map((c) => {
              const m = metricsFromJson(c);
              const tone = toneOf(c);
              const sub =
                m.phase === "graduated" && m.gapPct !== null ? `+${pct(m.gapPct)}% ${t("aboveFloor")}` : c.brake.engaged ? t("brake") : `${Math.round(m.progress * 100)}% ${t("curve")}`;
              return (
                <Link
                  key={c.mint}
                  href={`/coin/${c.mint}`}
                  prefetch={false}
                  className={cn("sticker-tile press flex aspect-square flex-col justify-between rounded-[12px] p-3 transition-transform duration-200 hover:-translate-y-0.5 sm:p-4", BG[tone])}
                >
                  <span className="text-[15px] font-bold leading-none sm:text-lg">${c.symbol}</span>
                  <span>
                    <span className="num block text-[15px] font-semibold leading-tight sm:text-xl">{solCompact(m.mcapLamports)}</span>
                    <span className="mt-1 block text-[11px] font-medium leading-tight opacity-80 sm:text-xs">{sub}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </Reveal>
      </div>
      </div>
    </section>
  );
}
