"use client";
import { ColorType, LineSeries, LineStyle, createChart, type UTCTimestamp } from "lightweight-charts";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { NumRoll } from "@/components/ui/NumRoll";
import type { StatsJson } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { solFixed } from "@/lib/format";
import { MOTION, gsap, prefersReducedMotion } from "@/lib/gsap";
import { useLiveStats } from "@/lib/live/solReturned";
import { useIsDark } from "@/lib/theme";

const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function chartTheme() {
  return {
    layout: { background: { type: ColorType.Solid, color: cssVar("--card") }, textColor: cssVar("--ink-2") },
    grid: { vertLines: { visible: false }, horzLines: { color: cssVar("--line"), style: LineStyle.Solid } },
    rightPriceScale: { borderColor: cssVar("--line") },
    timeScale: { borderColor: cssVar("--line") },
  };
}

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
    <dl className="grid grid-cols-2 gap-x-8 border-b border-dashed border-seam lg:grid-cols-4">
      {items.map((it) => (
        <div key={it.k} className={cn("min-w-0 border-t border-dashed border-seam py-6", it.wide && "col-span-2 lg:col-span-1")}>
          <dt className="text-sm text-ink-2">{it.k}</dt>
          <dd className="mt-3 flex items-baseline gap-2 whitespace-nowrap text-3xl sm:text-4xl">
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
  const chartRef = useRef<{ chart: IChartApi; line: ISeriesApi<"Line"> } | null>(null);
  const dark = useIsDark();
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const theme = chartTheme();
    const chart = createChart(el, {
      autoSize: true,
      ...theme,
      layout: { ...theme.layout, fontFamily: "var(--font-jetbrains), monospace", fontSize: 11 },
      handleScroll: false,
      handleScale: false,
      localization: { priceFormatter: (v: number) => v.toFixed(0) },
    });
    const line = chart.addSeries(LineSeries, { color: cssVar("--floor"), lineWidth: 3, priceLineVisible: false, lastValueVisible: true });
    chartRef.current = { chart, line };
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
    return () => {
      tween?.kill();
      chart.remove();
      chartRef.current = null;
    };
  }, [series]);
  // Day and night: re-read the CSS variables when data-theme changes.
  useEffect(() => {
    const c = chartRef.current;
    if (!c) return;
    c.chart.applyOptions(chartTheme());
    c.line.applyOptions({ color: cssVar("--floor") });
  }, [dark]);
  return (
    <figure className="plate overflow-hidden">
      <figcaption className="border-b border-dashed border-seam text-sm font-semibold">
        <span className="flex items-baseline justify-between px-4 py-2.5">
          <span>{t("chartTitle")}</span>
          <span className="text-xs text-ink-3">{t("chartUnit")}</span>
        </span>
      </figcaption>
      <div ref={box} className="h-[260px] w-full sm:h-[320px]" role="img" aria-label={t("chartTitle")} />
    </figure>
  );
}
