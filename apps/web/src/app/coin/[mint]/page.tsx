import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { CoinView } from "@/components/coin/CoinView";
import { api, safely } from "@/lib/api/client";
import type { CandleInterval } from "@/lib/api/types";
import { isPubkey } from "@/lib/chain/reads";
import { metricsFromJson } from "@/lib/coin/metrics";
import { resolveCoin } from "@/lib/coin/resolve";
import { pct, tiny } from "@/lib/format";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ mint: string }> };

/** Young coins read best on 1m candles, older ones on 5m or 1h. */
function intervalFor(createdAt: string | null): CandleInterval {
  const ageMs = createdAt ? Date.now() - Date.parse(createdAt) : 0;
  return ageMs > 36 * 3_600_000 ? "1h" : ageMs > 3 * 3_600_000 ? "5m" : "1m";
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { mint } = await params;
  const t = await getTranslations("meta");
  const coin = await resolveCoin(mint);
  if (!coin) return { title: t("coinMissing") };
  const m = metricsFromJson(coin);
  const floor = m.phase === "graduated" ? t("coinFloor", { floor: tiny(m.floorSol), gap: m.gapPct !== null ? pct(m.gapPct) : "0" }) : t("coinCurve", { pct: pct(m.progress * 100) });
  const title = `${coin.name} ($${coin.symbol})`;
  const og = `/api/og/${mint}`;
  return {
    title,
    description: floor,
    openGraph: { title, description: floor, images: [{ url: og, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description: floor, images: [og] },
  };
}

export default async function CoinPage({ params }: Params) {
  const { mint } = await params;
  if (!isPubkey(mint)) notFound();
  const coin = await safely(api.coin(mint), null);
  const interval = intervalFor(coin?.created_at ?? null);
  const [candles, trades] = await Promise.all([
    coin ? safely(api.candles(mint, interval), { interval, unit: "", items: [] }) : Promise.resolve({ interval, unit: "", items: [] }),
    coin ? safely(api.trades(mint, 100), { items: [], next_before: null }) : Promise.resolve({ items: [], next_before: null }),
  ]);
  return <CoinView key={mint} mint={mint} initial={coin} initialCandles={candles.items} initialTrades={trades.items} initialInterval={interval} />;
}
