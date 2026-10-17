"use client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { memo } from "react";
import { Age, CoinAvatar } from "@/components/ui/Bits";
import { CurveProgress, FloorBadge, GapMeter, gapText } from "@/components/ui/Floor";
import { Num, Price } from "@/components/ui/Num";
import type { CoinJson } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { metricsFromJson } from "@/lib/coin/metrics";
import { pct, solCompact } from "@/lib/format";

/** One coin, Pump-dense: the whole card is the link. */
export const CoinCard = memo(function CoinCard({ coin, className, preview }: { coin: CoinJson; className?: string; preview?: boolean }) {
  const t = useTranslations("coin");
  const tf = useTranslations("floor");
  const m = metricsFromJson(coin);
  const graduated = m.phase === "graduated";
  const body = (
    <>
      <CoinAvatar src={coin.image_url} symbol={coin.symbol} size={56} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-md font-semibold leading-tight">{coin.name || t("unnamed")}</p>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-ink-2">
              <span className="num text-ink">${coin.symbol}</span>
              {coin.created_at ? <Age ts={coin.created_at} className="text-ink-3" /> : null}
              {coin.brake.engaged ? (
                <span className="rounded-sm bg-brake px-1.5 py-px text-[11px] font-semibold leading-4 text-brake-ink">{t("brakeTag")}</span>
              ) : null}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <Price value={m.priceSol} className="text-sm" />
            <p className="text-xs text-ink-3">
              {t("mcap")} <Num className="text-ink-2">{solCompact(m.mcapLamports)}</Num>
            </p>
          </div>
        </div>
        {graduated ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <FloorBadge floorSol={m.floorSol} active />
              <span className="truncate text-xs text-ink-2">{gapText(tf, m.gapPct)}</span>
            </div>
            <GapMeter gapPct={m.gapPct} guaranteedShare={m.guaranteedShare} compact />
          </div>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <FloorBadge floorSol={0} active={false} short />
              <span className="num whitespace-nowrap text-xs text-ink-2" title={t("toGraduation", { pct: pct(m.progress * 100) })}>
                {pct(m.progress * 100)} %
              </span>
            </div>
            <CurveProgress value={m.progress} />
          </div>
        )}
      </div>
    </>
  );
  const cls = cn("flex gap-3 rounded-sm border border-line bg-bg p-3 transition-colors duration-150", !preview && "hover-row", className);
  if (preview) return <div className={cls}>{body}</div>;
  return (
    <Link href={`/coin/${coin.mint}`} className={cls} prefetch={false}>
      {body}
    </Link>
  );
});
