"use client";
import { TOTAL_SUPPLY, feeCeil } from "@floored/sdk";
import { Pause, Play } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Num, Price } from "@/components/ui/Num";
import { api } from "@/lib/api/client";
import type { CoinJson, TradeJson } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { ENV, explorerTx } from "@/lib/env";
import { countdown, pct, shortAddress, sol, tiny, tokens } from "@/lib/format";
import { gsap, prefersReducedMotion } from "@/lib/gsap";
import { EmptyState } from "@/components/ui/EmptyState";

interface Point {
  ms: number;
  price: number;
  floor: number;
  queued: bigint;
  kind: "pre" | "dump" | "fill" | "trade";
}

interface Episode {
  dump: TradeJson;
  points: Point[];
  devTokens: bigint;
  executedSol: bigint;
  fillSol: bigint;
  windows: number;
  maxStepDrop: number;
  floorChange: number;
  steps: { ms: number; drop: number }[];
  redeemInstead: bigint;
  supply: bigint;
}

async function loadTrades(mint: string, dev: string): Promise<TradeJson[]> {
  if (ENV.mock) return (await import("@/lib/mock/api")).mockAllTrades(mint).then((r) => r.items);
  if (api.available) {
    const out: TradeJson[] = [];
    let before: string | undefined;
    for (let i = 0; i < 6; i++) {
      const r = await api.trades(mint, 200, before);
      out.push(...r.items);
      if (!r.next_before) break;
      before = r.next_before;
    }
    return out.reverse();
  }
  const { readChallengeHistory } = await import("@/lib/chain/history");
  return readChallengeHistory(mint, dev);
}

function buildEpisode(trades: TradeJson[], dev: string, supply: bigint): Episode | null {
  const sells = trades.filter((t) => t.side === "sell" && !t.is_queue_fill && t.kind !== "redeem" && BigInt(t.queued_remainder) > 0n);
  if (!sells.length) return null;
  const devSells = sells.filter((t) => t.user === dev);
  const pool = devSells.length ? devSells : sells;
  const size = (t: TradeJson) => BigInt(t.token_amount) + BigInt(t.queued_remainder);
  // The dev's latest dump, else the biggest braked sale.
  const dump = devSells.length ? pool[pool.length - 1]! : pool.reduce((a, b) => (size(b) > size(a) ? b : a));
  const i0 = trades.indexOf(dump);
  const pre = trades.slice(Math.max(0, i0 - 12), i0).filter((t) => t.kind !== "redeem");
  let queued = BigInt(dump.queued_remainder);
  const points: Point[] = pre.map((t) => ({ ms: Date.parse(t.ts), price: t.price_after_display, floor: t.floor_after_display, queued: 0n, kind: "pre" }));
  const before = pre[pre.length - 1];
  const startPrice = before?.price_after_display ?? dump.price_after_display;
  points.push({ ms: Date.parse(dump.ts), price: dump.price_after_display, floor: dump.floor_after_display, queued, kind: "dump" });
  let fillSol = 0n;
  let windows = 0;
  let lastPrice = startPrice;
  const steps: { ms: number; drop: number }[] = [];
  const firstDrop = startPrice > 0 ? (1 - dump.price_after_display / startPrice) * 100 : 0;
  steps.push({ ms: Date.parse(dump.ts), drop: firstDrop });
  lastPrice = dump.price_after_display;
  let tail = 0;
  for (const t of trades.slice(i0 + 1)) {
    if (t.kind === "redeem") continue;
    if (t.is_queue_fill) {
      queued -= BigInt(t.token_amount);
      if (queued < 0n) queued = 0n;
      fillSol += BigInt(t.sol_amount);
      windows++;
      const drop = lastPrice > 0 ? (1 - t.price_after_display / lastPrice) * 100 : 0;
      steps.push({ ms: Date.parse(t.ts), drop });
    }
    lastPrice = t.price_after_display;
    points.push({ ms: Date.parse(t.ts), price: t.price_after_display, floor: t.floor_after_display, queued, kind: t.is_queue_fill ? "fill" : "trade" });
    if (queued === 0n && ++tail > 6) break;
  }
  const floors = points.filter((p) => p.floor > 0).map((p) => p.floor);
  const f0 = floors[0] ?? 0;
  const f1 = floors[floors.length - 1] ?? 0;
  const devTokens = size(dump);
  // Counterfactual: redeem the whole bag at T0. Gross = floor × x (that is S·x/C), then the SDK's exit fee.
  const lastFloor = [...pre].reverse().find((t) => t.floor_after_display > 0)?.floor_after_display;
  const floorAt0 = lastFloor ?? dump.floor_after_display;
  const gross = BigInt(Math.floor(floorAt0 * 1e9 * (Number(devTokens) / 1e6)));
  const redeemInstead = gross > 0n ? gross - feeCeil(gross, 50) : 0n;
  return {
    dump,
    points,
    devTokens,
    executedSol: BigInt(dump.sol_amount),
    fillSol,
    windows,
    maxStepDrop: Math.max(0, ...steps.map((s) => s.drop)),
    floorChange: f0 > 0 ? (f1 / f0 - 1) * 100 : 0,
    steps,
    redeemInstead,
    supply,
  };
}

export function ChallengeReplay({ coin, mint, dev }: { coin: CoinJson | null; mint: string; dev: string }) {
  const t = useTranslations("challenge");
  const [trades, setTrades] = useState<TradeJson[] | null>(null);
  const [error, setError] = useState(false);
  const [p, setP] = useState(1);
  const [playing, setPlaying] = useState(false);
  const tween = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    let live = true;
    loadTrades(mint, dev)
      .then((tr) => live && setTrades(tr))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [mint, dev]);

  // Share of the initial supply: redemptions burn tokens, so today's supply is smaller.
  const ep = useMemo(() => (trades ? buildEpisode(trades, dev, TOTAL_SUPPLY) : null), [trades, dev]);

  const play = () => {
    tween.current?.kill();
    if (prefersReducedMotion()) {
      setP(1);
      return;
    }
    const st = { v: p >= 1 ? 0 : p };
    setPlaying(true);
    tween.current = gsap.to(st, { v: 1, duration: 9 * (1 - st.v), ease: "none", onUpdate: () => setP(st.v), onComplete: () => setPlaying(false) });
  };
  const pause = () => {
    tween.current?.kill();
    setPlaying(false);
  };
  useEffect(() => () => void tween.current?.kill(), []);

  if (error) return <p className="text-md text-down">{t("loadError", { cluster: ENV.cluster })}</p>;
  if (!trades) return <Skeleton className="h-[420px]" />;
  if (!ep) return <EmptyState className="text-md">{t("noDump")}</EmptyState>;

  // Even spacing per event: the hours before T0 and the one-minute windows after read at the same scale.
  const pts = ep.points;
  const n = pts.length;
  const cutoff = Math.max(0, Math.round(p * (n - 1)));
  const visible = pts.slice(0, cutoff + 1);
  const cur = visible[visible.length - 1] ?? pts[0]!;
  const curMs = cur.ms;
  const maxP = Math.max(...pts.map((x) => x.price), ...pts.map((x) => x.floor)) * 1.08;
  const W = 800;
  const H = 320;
  const pad = { l: 8, r: 8, t: 24, b: 28 };
  const indexOf = new Map(pts.map((x, i) => [x, i]));
  const xAt = (i: number) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r);
  const yOf = (v: number) => pad.t + (1 - v / maxP) * (H - pad.t - pad.b);
  const stepPath = (key: "price" | "floor") =>
    visible
      .filter((x) => x[key] > 0)
      .map((x, i, arr) => {
        const X = xAt(indexOf.get(x)!).toFixed(1);
        const Y = yOf(x[key]).toFixed(1);
        if (i === 0) return `M${X} ${Y}`;
        const prevY = yOf(arr[i - 1]![key]).toFixed(1);
        return `L${X} ${prevY} L${X} ${Y}`;
      })
      .join(" ");
  const dumpIdx = pts.findIndex((x) => x.kind === "dump");
  const dumpX = xAt(dumpIdx);
  const endIdx = pts.findIndex((x, i) => i > dumpIdx && x.queued === 0n);
  const brakeEndX = xAt(endIdx === -1 ? n - 1 : endIdx);
  const engaged = cur.queued > 0n;
  const sincedump = (curMs - Date.parse(ep.dump.ts)) / 1000;
  const devShare = ep.supply > 0n ? Number((ep.devTokens * 10_000n) / ep.supply) / 100 : 0;

  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-2 gap-x-8 border-b border-dashed border-seam lg:grid-cols-4">
        <Stat k={t("statDump")} v={<Num unit={coin?.symbol}>{tokens(ep.devTokens)}</Num>} hint={t("statDumpHint", { pct: pct(devShare) })} />
        <Stat k={t("statStep")} v={<Num>{`${pct(ep.maxStepDrop)} %`}</Num>} hint={t("statStepHint")} />
        <Stat k={t("statFloor")} v={<Num className="text-floor">{`${ep.floorChange >= 0 ? "+" : ""}${pct(ep.floorChange)} %`}</Num>} hint={t("statFloorHint")} />
        <Stat k={t("statWindows")} v={<Num>{ep.windows}</Num>} hint={t("statWindowsHint")} />
      </dl>

      <div className="patch-card overflow-hidden p-3 md:p-4">
        <div className={cn("grid transition-[grid-template-rows] duration-300", engaged ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
          <div className="overflow-hidden">
            <div className="pb-3">
              <p className="well border-l-4 border-l-brake px-4 py-2.5 text-sm text-ink-2">{t("replayBanner", { tokens: tokens(cur.queued) })}</p>
            </div>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t("chartAria")}>
          <rect x={dumpX} y={pad.t} width={Math.max(0, brakeEndX - dumpX)} height={H - pad.t - pad.b} fill="var(--brake)" opacity="0.07" />
          <line x1={dumpX} y1={pad.t - 10} x2={dumpX} y2={H - pad.b} stroke="var(--ink-3)" strokeDasharray="3 4" />
          <text x={dumpX + 6} y={pad.t - 2} fill="var(--ink-2)" fontSize="12" fontFamily="var(--font-jetbrains)">
            T0
          </text>
          <path d={stepPath("price")} fill="none" stroke="var(--ink)" strokeWidth="2" />
          <path d={stepPath("floor")} fill="none" stroke="var(--floor)" strokeWidth="3" />
          {cur.floor > 0 ? (
            <text x={pad.l + 4} y={yOf(cur.floor) + 16} fill="var(--floor)" fontSize="12" fontFamily="var(--font-jetbrains)">
              floor {tiny(cur.floor)}
            </text>
          ) : null}
          <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="var(--line-2)" />
        </svg>
        <div className="flex flex-wrap items-center gap-3 border-t border-dashed border-seam px-3 py-3">
          <Button size="sm" variant="primary" onClick={playing ? pause : play} aria-label={playing ? t("pause") : t("play")}>
            {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? t("pause") : p >= 1 ? t("replay") : t("play")}
          </Button>
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(p * 1000)}
            onChange={(e) => {
              pause();
              setP(Number(e.target.value) / 1000);
            }}
            aria-label={t("scrub")}
            className="h-1 min-w-[120px] flex-1 accent-[var(--floor)]"
          />
          <span className="num w-[7ch] text-right text-xs text-ink-2">{sincedump >= 0 ? `T0+${countdown(sincedump)}` : `T0-${countdown(-sincedump)}`}</span>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-dashed divide-seam border-t border-dashed border-seam text-sm">
          <div className="min-w-0 px-4 py-3">
            <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-2">{t("price")}</dt>
            <dd className="mt-0.5">
              <Price value={cur.price} />
            </dd>
          </div>
          <div className="min-w-0 px-4 py-3">
            <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-2">{t("floor")}</dt>
            <dd className="mt-0.5 text-floor">
              <Price value={cur.floor} />
            </dd>
          </div>
          <div className="min-w-0 px-4 py-3">
            <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-2">{t("queued")}</dt>
            <dd className="num mt-0.5">{tokens(cur.queued)}</dd>
          </div>
        </dl>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="text-2xl">{t("stairsTitle")}</h2>
          <p className="mt-2 text-md text-ink-2">{t("stairsText")}</p>
          <ol className="mt-4 space-y-1.5">
            {ep.steps.slice(0, 12).map((s, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="num w-16 shrink-0 text-ink-3">{i === 0 ? "T0" : t("window", { n: i })}</span>
                <span className="relative h-2 flex-1">
                  <span className="absolute inset-y-0 left-0 bg-ink-3" style={{ width: `${Math.min(100, Math.max(1, s.drop) * 4)}%` }} />
                  <span className="absolute inset-y-0 border-l border-dashed border-brake" style={{ left: "80%" }} />
                </span>
                <span className="num w-14 text-right">-{pct(Math.max(0, s.drop))} %</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-ink-3">{t("stairsLimit")}</p>
        </section>
        <section className="patch-card p-6">
          <h2 className="text-2xl">{t("cfTitle")}</h2>
          <dl className="mt-4 space-y-3">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-md text-ink-2">{t("cfSold", { n: ep.windows })}</dt>
              <dd className="num text-lg">{sol(ep.executedSol + ep.fillSol)} SOL</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-dashed border-seam pt-3">
              <dt className="text-md text-floor">{t("cfRedeem")}</dt>
              <dd className="num text-lg text-floor">{sol(ep.redeemInstead)} SOL</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-ink-2">{t("cfNote")}</p>
          <p className="mt-4 text-xs text-ink-3">
            {t("dumpTx")}{" "}
            <a href={explorerTx(ep.dump.signature)} target="_blank" rel="noreferrer" className="num text-ink-2 hover:text-ink">
              {shortAddress(ep.dump.signature, 6)}
            </a>
          </p>
          <Link href={`/coin/${mint}`} className="mt-4 inline-block text-md underline decoration-line-2 underline-offset-4 hover:decoration-ink">
            {t("openCoin")}
          </Link>
        </section>
      </div>
    </div>
  );
}

function Stat({ k, v, hint }: { k: string; v: React.ReactNode; hint: string }) {
  return (
    <div className="min-w-0 border-t border-dashed border-seam py-5">
      <dt className="text-sm text-ink-2">{k}</dt>
      <dd className="mt-2 text-2xl">{v}</dd>
      <p className="mt-1 text-xs text-ink-3">{hint}</p>
    </div>
  );
}
