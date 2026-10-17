"use client";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";
import { Tabs } from "@/components/ui/Tabs";
import type { CandleInterval, CandleJson } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { tiny } from "@/lib/format";
import { MOTION, gsap, prefersReducedMotion } from "@/lib/gsap";

const INTERVALS: CandleInterval[] = ["1m", "5m", "1h"];

const nowSec = () => Math.floor(Date.now() / 1000) as UTCTimestamp;

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function withAlpha(color: string, a: number): string {
  if (color.startsWith("#") && color.length === 7) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  const m = /rgba?\(([^)]+)\)/.exec(color);
  if (m) {
    const [r, g, b] = m[1]!.split(",").map((x) => x.trim());
    return `rgba(${r},${g},${b},${a})`;
  }
  return color;
}

interface Palette {
  bg2: string;
  line: string;
  ink: string;
  ink3: string;
  floor: string;
  up: string;
  down: string;
  bg3: string;
}

function palette(): Palette {
  return { bg2: css("--surface"), line: css("--stroke"), ink: css("--ink"), ink3: css("--ink-3"), floor: css("--floor"), up: css("--up"), down: css("--down"), bg3: css("--bg-3") };
}

/**
 * Candles + the floor. The floor is a 3 px orange line series drawn under the
 * candles with a floor-dim fill down to the axis. On first paint the line pours
 * in left to right (900 ms, power2.out), then the fill fades in (300 ms).
 */
export function Chart({
  candles,
  interval,
  onInterval,
  floorNow,
  floorActive,
  floorPreview,
  height,
  loading,
  emptyNote,
}: {
  candles: CandleJson[];
  interval: CandleInterval;
  onInterval: (i: CandleInterval) => void;
  /** Current floor (SOL per token) from the chain or the latest row; drawn when there is no history. */
  floorNow: number;
  floorActive: boolean;
  /** Curve phase: where the floor will start at graduation (dashed preview line). */
  floorPreview: number;
  height: { mobile: number; desktop: number };
  loading?: boolean;
  emptyNote?: string | null;
}) {
  const t = useTranslations("chart");
  const box = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const s = useRef<{ candles: ISeriesApi<"Candlestick">; floor: ISeriesApi<"Line">; fill: ISeriesApi<"Area">; preview: ISeriesApi<"Line"> } | null>(null);
  const poured = useRef(false);
  const tween = useRef<gsap.core.Tween | null>(null);

  const data = useMemo(() => {
    const c = candles.map((k) => ({
      time: k.time as UTCTimestamp,
      open: k.display.open,
      high: k.display.high,
      low: k.display.low,
      close: k.display.close,
    }));
    let f = floorActive ? candles.filter((k) => k.display.floor_at_close > 0).map((k) => ({ time: k.time as UTCTimestamp, value: k.display.floor_at_close })) : [];
    if (floorActive && floorNow > 0) {
      const now = nowSec();
      if (f.length === 0) {
        // No history (RPC-only mode): draw the floor at its current level over the last hour.
        f = Array.from({ length: 61 }, (_, i) => ({ time: (now - 3600 + i * 60) as UTCTimestamp, value: floorNow }));
      } else {
        const last = f[f.length - 1]!;
        f = [...f.slice(0, -1), { time: last.time, value: floorNow }];
      }
    }
    let p: { time: UTCTimestamp; value: number }[] = [];
    if (!floorActive && floorPreview > 0) {
      const first = c[0]?.time ?? ((nowSec() - 3600) as UTCTimestamp);
      const last = c[c.length - 1]?.time ?? nowSec();
      p = first === last ? [{ time: first, value: floorPreview }] : [
        { time: first, value: floorPreview },
        { time: last, value: floorPreview },
      ];
    }
    return { c, f, p };
  }, [candles, floorActive, floorNow, floorPreview]);

  // Create once.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const pal = palette();
    const fmt = (v: number) => tiny(v, 4);
    const c = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: pal.bg2 },
        textColor: pal.ink3,
        fontFamily: "var(--font-jetbrains), ui-monospace, monospace",
        fontSize: 11,
        attributionLogo: true,
      },
      grid: { vertLines: { color: withAlpha(pal.line, 0.5) }, horzLines: { color: withAlpha(pal.line, 0.5) } },
      rightPriceScale: { borderColor: pal.line, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { borderColor: pal.line, timeVisible: true, secondsVisible: false, rightOffset: 4 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: pal.ink3, style: LineStyle.Dashed, width: 1, labelBackgroundColor: pal.bg3 },
        horzLine: { color: pal.ink3, style: LineStyle.Dashed, width: 1, labelBackgroundColor: pal.bg3 },
      },
      localization: { priceFormatter: fmt },
    });
    const priceFormat = { type: "custom" as const, formatter: fmt, minMove: 1e-13 };
    const fill = c.addSeries(AreaSeries, {
      lineVisible: false,
      lineWidth: 1,
      topColor: withAlpha(pal.floor, 0),
      bottomColor: withAlpha(pal.floor, 0),
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceFormat,
    });
    const floor = c.addSeries(LineSeries, {
      color: pal.floor,
      lineWidth: 3,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: false,
      title: "±0.00",
      priceFormat,
    });
    const preview = c.addSeries(LineSeries, {
      color: pal.floor,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      priceFormat,
    });
    const candlesSeries = c.addSeries(CandlestickSeries, {
      upColor: pal.up,
      downColor: pal.down,
      wickUpColor: pal.up,
      wickDownColor: pal.down,
      borderVisible: false,
      priceLineVisible: true,
      priceLineColor: pal.ink,
      priceLineWidth: 1,
      priceLineStyle: LineStyle.Solid,
      priceFormat,
    });
    chart.current = c;
    s.current = { candles: candlesSeries, floor, fill, preview };

    // Follow the theme toggle.
    const mo = new MutationObserver(() => {
      const p = palette();
      c.applyOptions({
        layout: { background: { type: ColorType.Solid, color: p.bg2 }, textColor: p.ink3 },
        grid: { vertLines: { color: withAlpha(p.line, 0.5) }, horzLines: { color: withAlpha(p.line, 0.5) } },
        rightPriceScale: { borderColor: p.line },
        timeScale: { borderColor: p.line },
      });
      candlesSeries.applyOptions({ upColor: p.up, downColor: p.down, wickUpColor: p.up, wickDownColor: p.down, priceLineColor: p.ink });
      floor.applyOptions({ color: p.floor });
      preview.applyOptions({ color: p.floor });
      if (poured.current) fill.applyOptions({ topColor: withAlpha(p.floor, 0.22), bottomColor: withAlpha(p.floor, 0.05) });
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      mo.disconnect();
      tween.current?.kill();
      c.remove();
      chart.current = null;
      s.current = null;
      poured.current = false;
    };
  }, []);

  // Data updates; the first non-empty floor pours in.
  useEffect(() => {
    const ser = s.current;
    if (!ser) return;
    ser.candles.setData(data.c);
    ser.preview.setData(data.p);
    const pal = palette();
    if (!poured.current && data.f.length > 0) {
      poured.current = true;
      ser.fill.setData(data.f);
      chart.current?.timeScale().fitContent();
      if (prefersReducedMotion()) {
        ser.floor.setData(data.f);
        ser.fill.applyOptions({ topColor: withAlpha(pal.floor, 0.22), bottomColor: withAlpha(pal.floor, 0.05) });
        return;
      }
      const n = data.f.length;
      const state = { p: 0, a: 0 };
      ser.floor.setData([]);
      tween.current = gsap.to(state, {
        p: 1,
        duration: MOTION.pour,
        ease: "power2.out",
        onUpdate: () => ser.floor.setData(data.f.slice(0, Math.max(1, Math.ceil(state.p * n)))),
        onComplete: () => {
          ser.floor.setData(data.f);
          tween.current = gsap.to(state, {
            a: 1,
            duration: MOTION.fillFade,
            ease: "power1.out",
            onUpdate: () => ser.fill.applyOptions({ topColor: withAlpha(pal.floor, 0.22 * state.a), bottomColor: withAlpha(pal.floor, 0.05 * state.a) }),
          });
        },
      });
      return;
    }
    if (!tween.current?.isActive()) {
      ser.floor.setData(data.f);
      ser.fill.setData(data.f);
    }
    if (!poured.current) chart.current?.timeScale().fitContent();
  }, [data]);

  const empty = !loading && candles.length === 0;

  return (
    <div className="sticker overflow-hidden">
      
      <div className="flex items-center justify-between gap-3 border-b border-stroke py-2 pl-4 pr-2">
        <div className="flex items-center gap-3 py-2 text-xs text-ink-2">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="block h-[3px] w-4 bg-floor" />
            {floorActive ? t("floorLegend") : t("previewLegend")}
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            <span aria-hidden className="block h-px w-4 bg-ink" />
            {t("priceLegend")}
          </span>
        </div>
        <Tabs idPrefix="chart" flat size="sm" items={INTERVALS.map((i) => ({ key: i, label: <span className="num">{i}</span> }))} value={interval} onChange={onInterval} className="border-stroke" />
      </div>
      <div className="relative">
        <div ref={box} className={cn("w-full", "h-[var(--h-m)] lg:h-[var(--h-d)]")} style={{ ["--h-m" as string]: `${height.mobile}px`, ["--h-d" as string]: `${height.desktop}px` }} role="img" aria-label={t("aria")} />
        {empty ? (
          <div className="pointer-events-none absolute inset-x-0 top-6 z-10 flex justify-center px-6">
            <p className="max-w-sm rounded-lg border border-dashed border-stroke bg-bg-2/95 px-3 py-2 text-center text-xs text-ink-2">{emptyNote ?? t("empty")}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
