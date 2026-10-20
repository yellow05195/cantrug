"use client";
import { ArrowDownRight, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { SplitFlap } from "@/components/ui/SplitFlap";
import type { CoinJson } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { metricsFromJson } from "@/lib/coin/metrics";
import { ENV } from "@/lib/env";
import { pct, solCompact } from "@/lib/format";
import { useLiveCoins } from "@/lib/live/patch";

/*
 * Hero: the trading floor. The words on top, then the board: every row a
 * live coin on split-flap tiles that flip when its numbers move, standing on
 * the amber floor line. The board is the product, not a picture of it.
 */
export function Hero({ coins }: { coins: CoinJson[] }) {
  const t = useTranslations("home.hero");
  const tn = useTranslations("nav");

  return (
    <section className="relative mx-auto max-w-6xl px-4 pt-12 sm:px-6 md:pt-16">
      <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <p className="kicker flex items-center gap-2">
            <span className="size-1.5 animate-pulse rounded-full bg-up" aria-hidden />
            {t("kicker")}
            {ENV.mock ? (
              <span className="ml-2 rounded-[3px] border border-line-2 px-1.5 py-1 text-[10px] text-ink-3" title={tn("mockHint")}>
                {t("demo")}
              </span>
            ) : null}
          </p>
          <h1 className="mt-5 text-[clamp(52px,8.6vw,118px)]">
            {t("a")}
            <br />
            <span className="text-floor">{t("b")}</span>
          </h1>
        </div>
        <div className="max-w-[40ch] pb-2">
          <p className="text-base leading-relaxed text-ink-2">{t("lede")}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <ButtonLink href="/create" variant="primary" size="lg">
              {t("ctaLaunch")}
            </ButtonLink>
            <ButtonLink href="/how-it-works" variant="secondary" size="lg">
              {t("ctaHow")}
            </ButtonLink>
          </div>
        </div>
      </div>

      <Board coins={coins} />
    </section>
  );
}

function Board({ coins }: { coins: CoinJson[] }) {
  const t = useTranslations("home.board2");
  const picked = useMemo(() => {
    const seen = new Set<string>();
    return coins.filter((c) => !seen.has(c.mint) && seen.add(c.mint)).slice(0, 7);
  }, [coins]);
  const live = useLiveCoins(picked);

  return (
    <div className="board-housing mt-12 overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-6">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-2">{t("title")}</p>
        <Link href="#coins" className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink-3 hover:text-ink">
          {t("all")} →
        </Link>
      </div>

      <div className="hidden grid-cols-[minmax(0,1.5fr)_1fr_1fr_1fr] gap-4 px-6 pb-1 pt-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3 md:grid">
        <span>{t("col.coin")}</span>
        <span className="text-right">{t("col.mcap")}</span>
        <span className="text-right">{t("col.floor")}</span>
        <span className="text-right">{t("col.status")}</span>
      </div>

      <ul className="px-2 pb-3 sm:px-4">
        {live.map((c) => {
          const m = metricsFromJson(c);
          const graduated = m.phase === "graduated";
          const up = graduated ? (m.gapPct ?? 0) >= 0 : true;
          const status = c.brake.engaged ? t("status.brake") : graduated ? t("status.floored") : `${t("status.curve")} ${Math.round(m.progress * 100)}%`;
          const above = graduated && m.gapPct !== null ? `${m.gapPct >= 0 ? "+" : ""}${pct(m.gapPct)}%` : "—";
          const mcap = solCompact(m.mcapLamports);
          return (
            <li key={c.mint}>
              <Link
                href={`/coin/${c.mint}`}
                prefetch={false}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-[6px] px-2 py-2.5 transition-colors duration-150 hover:bg-card-2 md:grid-cols-[minmax(0,1.5fr)_1fr_1fr_1fr] md:px-4"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <SplitFlap text={c.symbol} width={6} className="text-[19px] text-ink sm:text-[22px]" />
                  <span className="hidden truncate text-sm text-ink-3 lg:inline">{c.name}</span>
                </span>
                <span className="justify-self-end text-ink">
                  <SplitFlap text={mcap} width={7} align="right" className="text-[19px] sm:text-[22px]" label={`${mcap} SOL`} />
                </span>
                <span className={cn("hidden items-center justify-end gap-1.5 md:flex", graduated ? (up ? "text-up" : "text-down") : "text-ink-3")}>
                  {graduated ? up ? <ArrowUpRight size={16} weight="bold" /> : <ArrowDownRight size={16} weight="bold" /> : null}
                  <SplitFlap text={above} width={6} align="right" className="text-[19px] sm:text-[22px]" />
                </span>
                <span className={cn("col-span-2 justify-self-start md:col-span-1 md:justify-self-end", c.brake.engaged ? "text-brake" : graduated ? "text-floor" : "text-ink-2")}>
                  <span className="hidden md:inline">
                    <SplitFlap text={status} width={9} align="right" className="text-[15px]" />
                  </span>
                  <span className="md:hidden">
                    <SplitFlap text={status} className="text-[13px]" />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="floor-line" aria-hidden />
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-ink-3 sm:px-6">
        <span>{t("legend")}</span>
        <span className="text-floor">{t("floorLabel")}</span>
      </div>
    </div>
  );
}
