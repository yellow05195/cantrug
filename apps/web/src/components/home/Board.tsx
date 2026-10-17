"use client";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Age, CoinAvatar } from "@/components/ui/Bits";
import { Flash } from "@/components/ui/Flash";
import { CurveProgress, FloorBadge, GapMeter, gapText } from "@/components/ui/Floor";
import { Num, Price } from "@/components/ui/Num";
import { Chip } from "@/components/ui/Sticker";
import { Tabs } from "@/components/ui/Tabs";
import type { CoinJson } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { metricsFromJson } from "@/lib/coin/metrics";
import { pct, solCompact } from "@/lib/format";
import { useLiveCoins } from "@/lib/live/patch";

export type BoardKey = "new" | "graduating" | "floor" | "all";

export interface BoardList {
  key: BoardKey;
  coins: CoinJson[];
}

/**
 * The board: one dense list with tabs instead of three identical columns.
 * Every row is a coin and a link; price, floor and gap are live. Column
 * labels are a real header on desktop; rows stack on phones.
 */
export function Board({ lists, available, demoMint }: { lists: BoardList[]; available: boolean; demoMint?: string | null }) {
  const t = useTranslations("home");
  const tc = useTranslations("coin");
  const tf = useTranslations("floor");
  const [tab, setTab] = useState<BoardKey>(lists[0]?.key ?? "new");

  const all = useMemo(() => {
    const map = new Map<string, CoinJson>();
    for (const l of lists) for (const c of l.coins) map.set(c.mint, c);
    return [...map.values()];
  }, [lists]);
  const live = useLiveCoins(all);
  const byMint = useMemo(() => new Map(live.map((c) => [c.mint, c])), [live]);

  const current = lists.find((l) => l.key === tab) ?? lists[0];
  const rows = (current?.coins ?? []).map((c) => byMint.get(c.mint) ?? c);
  if (tab === "floor") rows.sort((a, b) => metricsFromJson(b).floorSol - metricsFromJson(a).floorSol);

  return (
    <section id="coins" aria-labelledby="board-title" className="scroll-mt-24">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="kicker mb-3">{t("board.kicker")}</p>
          <h2 id="board-title" className="text-2xl sm:text-3xl">
            {t("board.title")}
          </h2>
          <p className="mt-1 text-md text-ink-2">{t("board.sub")}</p>
        </div>
        <Tabs idPrefix="board" size="md" value={tab} onChange={setTab} items={lists.map((l) => ({ key: l.key, label: t(`board.tab.${l.key}`) }))} />
      </div>

      <div className="patch-card overflow-hidden p-2" role="tabpanel" id={`board-panel-${tab}`}>
        {/* header row */}
        <div className="hidden grid-cols-[minmax(0,2.2fr)_1fr_1fr_minmax(0,1.6fr)_28px] items-center gap-4 border-b border-dashed border-seam px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-ink-2 md:grid">
          <span>{t("board.col.coin")}</span>
          <span className="text-right">{t("board.col.price")}</span>
          <span className="text-right">{t("board.col.floor")}</span>
          <span>{t("board.col.gap")}</span>
          <span />
        </div>
        {rows.length ? (
          <ul className="stagger-in divide-y divide-dashed divide-seam">
            {rows.map((c, i) => {
              const m = metricsFromJson(c);
              const graduated = m.phase === "graduated";
              return (
                <li key={c.mint} style={{ ["--i" as string]: i }}>
                  <Link
                    href={`/coin/${c.mint}`}
                    prefetch={false}
                    className={cn(
                      "hover-row grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-3 transition-colors duration-150",
                      "md:grid-cols-[minmax(0,2.2fr)_1fr_1fr_minmax(0,1.6fr)_28px] md:gap-4 md:px-4",
                    )}
                  >
                    {/* coin */}
                    <div className="contents md:flex md:min-w-0 md:items-center md:gap-3">
                      <CoinAvatar src={c.image_url} symbol={c.symbol} seed={c.mint} size={36} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate font-display text-base font-semibold leading-tight">
                          <span className="truncate">{c.name || tc("unnamed")}</span>
                          {c.brake.engaged ? (
                            <Chip tone="brake" className="px-2 py-0 text-[11px]">
                              {tc("brakeTag")}
                            </Chip>
                          ) : null}
                        </p>
                        <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-2">
                          <span className="num font-medium text-ink">${c.symbol}</span>
                          {c.created_at ? <Age ts={c.created_at} className="text-ink-3" /> : null}
                          {!graduated ? (
                            <span className="num text-ink-3">
                              {pct(m.progress * 100)}&nbsp;% {t("board.toGrad")}
                            </span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    {/* price */}
                    <div className="text-right md:contents">
                      <div className="md:text-right">
                        <Flash value={m.priceSol}>
                          <Price value={m.priceSol} className="text-md font-medium" />
                        </Flash>
                        <p className="text-xs text-ink-3">
                          {tc("mcap")} <Num className="text-ink-2">{solCompact(m.mcapLamports)}</Num>
                        </p>
                      </div>
                      {/* floor */}
                      <div className="hidden md:block md:text-right">
                        {graduated ? <FloorBadge floorSol={m.floorSol} active /> : <FloorBadge floorSol={0} active={false} short />}
                      </div>
                    </div>
                    {/* gap / progress, full width on phones */}
                    <div className="col-span-3 md:col-span-1">
                      {graduated ? (
                        <div className="flex items-center gap-3">
                          <GapMeter gapPct={m.gapPct} guaranteedShare={m.guaranteedShare} compact className="flex-1" />
                          <span className="num whitespace-nowrap text-xs text-ink-2">{gapText(tf, m.gapPct)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <CurveProgress value={m.progress} className="flex-1" />
                          <span className="num whitespace-nowrap text-xs text-ink-2 md:hidden">{tf("atGraduationShort")}</span>
                        </div>
                      )}
                    </div>
                    <CaretRight size={16} className="hidden text-ink-3 md:block" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-6 text-md text-ink-2">
            {available ? t("emptyColumn") : t("noIndexer")}
            {!available && demoMint ? (
              <>
                {" "}
                <Link href={`/coin/${demoMint}`} className="font-semibold text-floor underline-offset-4 hover:underline">
                  {t("openDemo")}
                </Link>
              </>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
