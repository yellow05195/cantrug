"use client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ViewTransition, memo } from "react";
import { CoinAvatar } from "@/components/ui/Bits";
import { Age } from "@/components/ui/Bits";
import { Flash } from "@/components/ui/Flash";
import { CurveProgress, FloorBadge, GapMeter, gapText } from "@/components/ui/Floor";
import { Num, Price } from "@/components/ui/Num";
import { Chip } from "@/components/ui/Sticker";
import type { CoinJson } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { metricsFromJson } from "@/lib/coin/metrics";
import { pct, solCompact } from "@/lib/format";

/** Shared-element names for the card to coin page morph (one per coin per page). */
export function vtName(mint: string, part: "av" | "nm") {
  return `coin-${part}-${mint}`;
}

function MaybeVT({ name, children }: { name: string | null; children: React.ReactNode }) {
  if (!name) return <>{children}</>;
  return (
    <ViewTransition name={name} share="auto" default="none">
      {children}
    </ViewTransition>
  );
}

/** One coin as a plate card: the whole card is the link. */
export const CoinCard = memo(function CoinCard({ coin, className, preview, vt, style }: { coin: CoinJson; className?: string; preview?: boolean; vt?: boolean; style?: React.CSSProperties }) {
  const t = useTranslations("coin");
  const tf = useTranslations("floor");
  const m = metricsFromJson(coin);
  const graduated = m.phase === "graduated";
  const body = (
    <>
      <MaybeVT name={vt ? vtName(coin.mint, "av") : null}>
        <CoinAvatar src={coin.image_url} symbol={coin.symbol} seed={coin.mint === "preview" ? coin.symbol : coin.mint} size={36} />
      </MaybeVT>
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <MaybeVT name={vt ? vtName(coin.mint, "nm") : null}>
              <p className="truncate font-display text-base font-semibold leading-tight">{coin.name || t("unnamed")}</p>
            </MaybeVT>
            <p className="mt-1 flex items-center gap-2 text-xs text-ink-2">
              <span className="num font-medium text-ink">${coin.symbol}</span>
              {coin.created_at ? <Age ts={coin.created_at} className="text-ink-3" /> : null}
              {coin.brake.engaged ? <Chip tone="brake" className="px-2 py-0 text-[11px]">{t("brakeTag")}</Chip> : null}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <Flash value={m.priceSol}>
              <Price value={m.priceSol} className="text-md font-medium" />
            </Flash>
            <p className="text-xs text-ink-3">
              {t("mcap")} <Num className="text-ink-2">{solCompact(m.mcapLamports)}</Num>
            </p>
          </div>
        </div>
        {graduated ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <FloorBadge floorSol={m.floorSol} active />
              <span className="truncate text-xs text-ink-2">{gapText(tf, m.gapPct)}</span>
            </div>
            <GapMeter gapPct={m.gapPct} guaranteedShare={m.guaranteedShare} compact />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <FloorBadge floorSol={0} active={false} short />
              <span className="num whitespace-nowrap text-xs font-medium text-ink-2" title={t("toGraduation", { pct: pct(m.progress * 100) })}>
                {pct(m.progress * 100)}&nbsp;%
              </span>
            </div>
            <CurveProgress value={m.progress} />
          </div>
        )}
      </div>
    </>
  );
  const cls = cn("plate flex gap-3 p-3", !preview && "lift", className);
  if (preview) return <div className={cls}>{body}</div>;
  return (
    <Link href={`/coin/${coin.mint}`} className={cls} prefetch={false} style={style}>
      {body}
    </Link>
  );
});
