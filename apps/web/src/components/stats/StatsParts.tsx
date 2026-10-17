"use client";
import { ColorType, LineSeries, LineStyle, createChart, type UTCTimestamp } from "lightweight-charts";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { NumRoll } from "@/components/ui/NumRoll";
import type { StatsJson } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { solFixed } from "@/lib/format";
import { MOTION, gsap, prefersReducedMotion } from "@/lib/gsap";
import { useLiveStats } from "@/lib/live/solReturned";

export function BigNumbers({ stats }: { stats: StatsJson }) {
  const t = useTranslations("stats");
  const s = useLiveStats({ lamports: BigInt(stats.sol_redeemed_total), launched: stats.coins_created, brakes: stats.brake_engagements_total });
  const items: { k: string; v: React.ReactNode; unit?: string; hint?: string; wide?: boolean }[] = [
    { k: t("returned"), v: <NumRoll value={solFixed(s.total ?? 0n, 2)} className="text-floor" />, unit: "SOL", wide: true },
    { k: t("launched"), v: <span className="num">{s.launched}</span> },
    { k: t("brakes"), v: <span className="num">{s.brakes}</span> },
    { k: t("rugs"), v: <span className="num">{stats.rugs_avoided}</span>, hint: t("rugsHint") },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line lg:grid-cols-4">
      {items.map((it) => (
        <div key={it.k} className={cn("bg-bg p-4 sm:p-5", it.wide && "col-span-2 lg:col-span-1")}>
          <dt className="text-sm text-ink-2">{it.k}</dt>
          <dd className="mt-3 flex items-baseline gap-2 text-3xl sm:text-4xl">
            {it.v}
            {it.unit ? <span className="num text-md text-ink-3">{it.unit}</span> : null}
          </dd>
          {it.hint ? <p className="mt-2 text-xs text-ink-3">{it.hint}</p> : null}
        </div>
      ))}
    </dl>
  );
}

/** SOL returned per day, one floor-orange line. Pours in like the coin chart's floor. */
export function ReturnedChart({ series }: { series: StatsJson["sol_redeemed_by_day"] }) {
  const t = useTranslations("stats");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: css("--bg-2") }, textColor: css("--ink-3"), fontFamily: "var(--font-jetbrains), monospace", fontSize: 11 },
      grid: { vertLines: { visible: false }, horzLines: { color: css("--line"), style: LineStyle.Solid } },
      rightPriceScale: { borderColor: css("--line") },
      timeScale: { borderColor: css("--line") },
      handleScroll: false,
      handleScale: false,
      localization: { priceFormatter: (v: number) => v.toFixed(0) },
    });
    const line = chart.addSeries(LineSeries, { color: css("--floor"), lineWidth: 3, priceLineVisible: false, lastValueVisible: true });
    const data = series.map((d) => ({ time: (Date.parse(`${d.day}T00:00:00Z`) / 1000) as UTCTimestamp, value: d.sol_out_display }));
    let tween: gsap.core.Tween | null = null;
    if (prefersReducedMotion() || data.length < 2) {
      line.setData(data);
      chart.timeScale().fitContent();
    } else {
      // Fix the visible range first, then pour the line into it.
      const range = { from: data[0]!.time, to: data[data.length - 1]!.time };
      const st = { p: 0 };
      tween = gsap.to(st, {
        p: 1,
        duration: MOTION.pour,
        ease: "power2.out",
        onUpdate: () => {
          line.setData(data.slice(0, Math.max(2, Math.ceil(st.p * data.length))));
          chart.timeScale().setVisibleRange(range);
        },
        onComplete: () => chart.timeScale().fitContent(),
      });
    }
    const mo = new MutationObserver(() => {
      chart.applyOptions({ layout: { background: { type: ColorType.Solid, color: css("--bg-2") }, textColor: css("--ink-3") }, grid: { horzLines: { color: css("--line") } } });
      line.applyOptions({ color: css("--floor") });
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      tween?.kill();
      mo.disconnect();
      chart.remove();
    };
  }, [series]);
  return (
    <figure className="rounded-sm border border-line bg-bg-2">
      <figcaption className="flex items-baseline justify-between border-b border-line px-4 py-2.5 text-sm">
        <span>{t("chartTitle")}</span>
        <span className="text-xs text-ink-3">{t("chartUnit")}</span>
      </figcaption>
      <div ref={box} className="h-[260px] w-full sm:h-[320px]" role="img" aria-label={t("chartTitle")} />
    </figure>
  );
}
