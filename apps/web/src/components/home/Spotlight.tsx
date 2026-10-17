"use client";
import { ArrowUpRight, Barricade, Buildings, Fire, TrendUp } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { CoinAvatar } from "@/components/ui/Bits";
import { Flash } from "@/components/ui/Flash";
import { CurveProgress, FloorBadge, GapMeter, gapText } from "@/components/ui/Floor";
import { Num, Price } from "@/components/ui/Num";
import { Chip } from "@/components/ui/Sticker";
import type { CandleJson, CoinJson } from "@/lib/api/types";
import { metricsFromJson } from "@/lib/coin/metrics";
import { bpsPct, pct, solCompact } from "@/lib/format";
import { useLiveCoin } from "@/lib/live/patch";

function MiniChart({ candles }: { candles: CandleJson[] }) {
  const pts = candles.slice(-60);
  if (pts.length < 2) return <div className="h-24 rounded-lg bg-bg-3" aria-hidden />;
  const W = 320;
  const H = 96;
  const max = Math.max(...pts.map((c) => Math.max(c.display.close, c.display.floor_at_close))) * 1.06;
  const y = (v: number) => H - (v / (max || 1)) * (H - 6) - 3;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const price = pts.map((c, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(c.display.close).toFixed(1)}`).join(" ");
  const floorPts = pts.map((c, i) => [x(i), c.display.floor_at_close] as const).filter(([, v]) => v > 0);
  const floor = floorPts.map(([px, v], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const fill = floorPts.length > 1 ? `${floor} L${floorPts[floorPts.length - 1]![0].toFixed(1)} ${H} L${floorPts[0]![0].toFixed(1)} ${H} Z` : "";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-24 w-full" aria-hidden>
      {fill ? <path d={fill} fill="var(--floor-dim)" /> : null}
      <path d={price} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {floor ? <path d={floor} fill="none" stroke="var(--floor)" strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /> : null}
    </svg>
  );
}

function SideChip({ icon, label, coin, value }: { icon: React.ReactNode; label: string; coin: CoinJson | null | undefined; value: React.ReactNode }) {
  if (!coin) return null;
  return (
    <Link href={`/coin/${coin.mint}`} prefetch={false} className="sticker lift flex items-center gap-3 p-3">
      <CoinAvatar src={coin.image_url} symbol={coin.symbol} seed={coin.mint} size={44} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
          {icon}
          {label}
        </p>
        <p className="mt-0.5 truncate text-md font-bold">
          {coin.name} <span className="num text-xs font-medium text-ink-2">${coin.symbol}</span>
        </p>
      </div>
      <div className="shrink-0 text-right text-sm">{value}</div>
    </Link>
  );
}

/** "Hot right now": the king of the hill, plus three quick chips. */
export function Spotlight({ coin: initial, candles, jump, grad, braked }: { coin: CoinJson; candles: CandleJson[]; jump: CoinJson | null; grad: CoinJson | null; braked: CoinJson | null }) {
  const t = useTranslations("hot");
  const tf = useTranslations("floor");
  const [coin] = useLiveCoin(initial);
  const m = metricsFromJson(coin);
  const graduated = m.phase === "graduated";
  const vol1h = BigInt(coin.volume_1h_sol ?? coin.volume_24h_sol ?? coin.volume_sol ?? "0");
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <div className="relative lg:col-span-8">
        <span aria-hidden className="breathe-ring pointer-events-none absolute -inset-1.5 rounded-[18px] border-[3px] border-floor" />
        <article className="sticker relative grid gap-5 p-5 sm:grid-cols-[1fr_1.1fr] sm:p-6 [--shadow:var(--floor-deep)]" style={{ boxShadow: "0 5px 0 0 var(--floor-deep)", borderColor: "var(--floor-deep)" }}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Chip tone="solid">
                <Fire size={14} weight="duotone" /> {t("king")}
              </Chip>
              {coin.brake.engaged ? <Chip tone="brake">{t("brake")}</Chip> : null}
            </div>
            <div className="mt-4 flex items-center gap-4">
              <CoinAvatar src={coin.image_url} symbol={coin.symbol} seed={coin.mint} size={76} />
              <div className="min-w-0">
                <h3 className="title-tight truncate text-2xl font-extrabold">{coin.name}</h3>
                <p className="num text-md text-ink-2">${coin.symbol}</p>
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-ink-3">{t("price")}</dt>
                <dd className="mt-0.5">
                  <Flash value={m.priceSol}>
                    <Price value={m.priceSol} className="text-md font-medium" />
                  </Flash>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">{t("mcap")}</dt>
                <dd className="mt-0.5">
                  <Num className="text-md font-medium" unit="SOL">
                    {solCompact(m.mcapLamports)}
                  </Num>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">{t("vol1h")}</dt>
                <dd className="mt-0.5">
                  <Num className="text-md font-medium" unit="SOL">
                    {solCompact(vol1h)}
                  </Num>
                </dd>
              </div>
            </dl>
          </div>
          <div className="flex min-w-0 flex-col justify-between gap-4">
            <MiniChart candles={candles} />
            {graduated ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <FloorBadge floorSol={m.floorSol} active size="md" />
                  <span className="truncate text-sm text-ink-2">{gapText(tf, m.gapPct)}</span>
                </div>
                <GapMeter gapPct={m.gapPct} guaranteedShare={m.guaranteedShare} compact />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <FloorBadge floorSol={0} active={false} short />
                  <span className="num text-sm text-ink-2">{pct(m.progress * 100)}&nbsp;%</span>
                </div>
                <CurveProgress value={m.progress} />
              </div>
            )}
            <ButtonLink href={`/coin/${coin.mint}`} variant="primary" size="lg" className="self-start">
              {t("trade", { symbol: coin.symbol })} <ArrowUpRight size={18} weight="bold" />
            </ButtonLink>
          </div>
        </article>
      </div>
      <div className="flex flex-col gap-3 lg:col-span-4">
        <SideChip
          icon={<TrendUp size={16} weight="duotone" />}
          label={jump?.floor_change_24h_bps != null ? t("jump") : t("highestFloor")}
          coin={jump}
          value={jump?.floor_change_24h_bps != null ? <span className="num font-medium text-up">+{bpsPct(jump.floor_change_24h_bps)}&nbsp;%</span> : jump ? <Price value={metricsFromJson(jump).floorSol} className="text-floor" /> : null}
        />
        <SideChip icon={<Buildings size={16} weight="duotone" />} label={t("newestGrad")} coin={grad} value={grad ? <Price value={metricsFromJson(grad).floorSol} className="text-floor" /> : null} />
        <SideChip icon={<Barricade size={16} weight="duotone" />} label={t("mostBraked")} coin={braked} value={braked ? <span className="num font-medium">{t("brakes", { n: braked.brake.engagements })}</span> : null} />
      </div>
    </div>
  );
}
