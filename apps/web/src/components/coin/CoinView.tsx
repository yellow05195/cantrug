"use client";
import { TOKEN_UNIT, circulating as circ, floorQ64, priceQ64, q64ToSolPerToken, windowStart } from "@floored/sdk";
import { X } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/Bits";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TabPanel, Tabs } from "@/components/ui/Tabs";
import { WalletModal } from "@/components/wallet/WalletButton";
import { api } from "@/lib/api/client";
import type { CandleInterval, CandleJson, CoinJson, HoldersJson, QueueJson, TradeJson, WsTrade } from "@/lib/api/types";
import { subscribe } from "@/lib/api/ws";
import { coinJsonFromChain } from "@/lib/chain/fromChain";
import { readTokenMeta, type TokenMeta } from "@/lib/chain/reads";
import { useCoinChain } from "@/lib/chain/useCoinChain";
import { metricsFromChain, metricsFromJson } from "@/lib/coin/metrics";
import { cn } from "@/lib/cn";
import { ENV } from "@/lib/env";
import { applyEvent, tradeFromEvent } from "@/lib/live/patch";
import { useTx } from "@/lib/tx/TxProvider";
import { useAccount } from "@/lib/wallet/account";
import { BrakeBanner, type BrakeInfo } from "./BrakeBanner";
import { Chart } from "./Chart";
import { AboutCoin, BagFloorBox, CoinHeader, KeyNumbers } from "./CoinBits";
import { Holders, QueuePanel, TradesFeed, useFreshKeys } from "./Feeds";
import { SlabLands, slabShouldPlay } from "./SlabLands";
import { TradePanel, type TradeTab } from "./TradePanel";

const STEP: Record<CandleInterval, number> = { "1m": 60, "5m": 300, "1h": 3600 };

function upsertCandle(list: CandleJson[], interval: CandleInterval, ts: number, price: number, floor: number, volLamports: bigint): CandleJson[] {
  if (!(price > 0)) return list;
  const step = STEP[interval];
  const bucket = Math.floor(ts / step) * step;
  const last = list[list.length - 1];
  if (last && last.time === bucket) {
    const d = last.display;
    const high = Math.max(d.high, price);
    const low = Math.min(d.low, price);
    const next: CandleJson = {
      ...last,
      close: String(price),
      high: String(high),
      low: String(low),
      floor_at_close: String(floor),
      trades: last.trades + 1,
      volume_sol: (BigInt(last.volume_sol) + volLamports).toString(),
      display: { ...d, close: price, high, low, floor_at_close: floor, volume_sol: d.volume_sol + Number(volLamports) / 1e9 },
    };
    return [...list.slice(0, -1), next];
  }
  if (last && bucket < last.time) return list;
  const open = last?.display.close ?? price;
  return [
    ...list,
    {
      bucket_ts: new Date(bucket * 1000).toISOString(),
      time: bucket,
      open: String(open),
      high: String(Math.max(open, price)),
      low: String(Math.min(open, price)),
      close: String(price),
      floor_at_close: String(floor),
      volume_sol: volLamports.toString(),
      trades: 1,
      display: { open, high: Math.max(open, price), low: Math.min(open, price), close: price, floor_at_close: floor, volume_sol: Number(volLamports) / 1e9 },
    },
  ].slice(-800);
}

type BottomTab = "trades" | "holders" | "queue" | "about";

const wallClock = () => Date.now();

export function CoinView({ mint, initial, initialCandles, initialTrades, initialInterval }: { mint: string; initial: CoinJson | null; initialCandles: CandleJson[]; initialTrades: TradeJson[]; initialInterval: CandleInterval }) {
  const t = useTranslations("coinPage");
  const account = useAccount();
  const tx = useTx();
  const chain = useCoinChain(mint, account.address);
  const [meta, setMeta] = useState<TokenMeta | null>(null);
  const [apiCoin, setApiCoin] = useState<CoinJson | null>(initial);
  const [seed, setSeed] = useState(initial);
  if (seed !== initial) {
    setSeed(initial);
    setApiCoin(initial);
  }
  const [interval, setIntervalKey] = useState<CandleInterval>(initialInterval);
  const [candles, setCandles] = useState<CandleJson[]>(initialCandles);
  const [candlesLoading, setCandlesLoading] = useState(false);
  const [trades, setTrades] = useState<TradeJson[]>(initialTrades);
  const [fresh, addFresh] = useFreshKeys();
  const [tab, setTab] = useState<BottomTab>("trades");
  const [tradeTab, setTradeTab] = useState<TradeTab>("buy");
  const [sheet, setSheet] = useState(false);
  const [holders, setHolders] = useState<HoldersJson | null>(null);
  const [queue, setQueue] = useState<QueueJson | null>(null);
  const [walletOpen, setWalletOpen] = useState(false);
  // "The slab lands" when the coin graduates while this page is open (once per coin per session).
  const [landed, setLanded] = useState(false);
  const [lastPhase, setLastPhase] = useState<string | null>(null);

  // RPC-only mode: name, symbol and image come from the Metaplex metadata account.
  useEffect(() => {
    if (initial || ENV.mock) return;
    let live = true;
    readTokenMeta(mint)
      .then((m) => live && setMeta(m))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [initial, mint]);

  // RPC-only mode: the feed comes from the program's own events.
  useEffect(() => {
    if (api.available || initialTrades.length) return;
    let live = true;
    import("@/lib/chain/history")
      .then(({ readTradeHistory }) => readTradeHistory(mint, 40, (rows) => live && setTrades([...rows].reverse())))
      .then((rows) => live && setTrades([...rows].reverse()))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [mint, initialTrades.length]);

  const coin: CoinJson | null = useMemo(() => {
    if (apiCoin) return apiCoin;
    if (chain.coin) return coinJsonFromChain(chain.coin, meta);
    return null;
  }, [apiCoin, chain.coin, meta]);

  const m = useMemo(() => (chain.coin ? metricsFromChain(chain.coin.state, chain.coin.supply) : coin ? metricsFromJson(coin) : null), [chain.coin, coin]);

  // Websocket: patch the row, the candles and the feed.
  useEffect(
    () =>
      subscribe(mint, (msg) => {
        setApiCoin((c) => (c ? applyEvent(c, msg) : c));
        const row = tradeFromEvent(msg, 0);
        if (row) {
          const key = `${row.signature}:${row.event_index}:${row.kind ?? "t"}`;
          setTrades((list) => (list.some((x) => x.signature === row.signature && x.kind === row.kind && x.is_queue_fill === row.is_queue_fill) ? list : [row, ...list].slice(0, 500)));
          addFresh(key);
        }
        if (msg.type === "Trade") {
          const d = msg.data as unknown as WsTrade;
          try {
            const price = q64ToSolPerToken(priceQ64(BigInt(d.sol_reserves), BigInt(d.token_reserves)));
            const c = circ(BigInt(d.supply), BigInt(d.pool_tok), BigInt(d.queued));
            const floor = d.phase === 1 && c > 0n ? q64ToSolPerToken(floorQ64(BigInt(d.pool_sol), c)) : 0;
            setCandles((list) => upsertCandle(list, interval, Number(d.timestamp), price, floor, BigInt(d.sol_amount)));
          } catch {
            /* ignore */
          }
        }
        if (msg.type.startsWith("Queue") || msg.type.startsWith("Brake")) {
          void api.queue(mint).then((q) => q && setQueue(q));
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mint, interval],
  );

  const changeInterval = useCallback(
    (i: CandleInterval) => {
      setIntervalKey(i);
      if (!api.available) return;
      setCandlesLoading(true);
      api
        .candles(mint, i)
        .then((r) => setCandles(r.items))
        .catch(() => setCandles([]))
        .finally(() => setCandlesLoading(false));
    },
    [mint],
  );

  const openTab = (k: BottomTab) => {
    setTab(k);
    if (k === "holders" && !holders) void api.holders(mint).then(setHolders);
    if (k === "queue") void api.queue(mint).then(setQueue);
  };

  const brake: BrakeInfo | null = useMemo(() => {
    if (chain.coin) {
      const now = wallClock();
      const s = chain.coin.state;
      const len = s.params.brakeWindowSlots;
      const est = chain.coin.slot + BigInt(Math.max(0, Math.floor((now - chain.coin.readAt) / 400)));
      const ws = windowStart(s.brake.windowStart, len, est);
      const endsAt = chain.coin.readAt + Number(ws + len - chain.coin.slot) * 400;
      // Dust (under one whole token) left in the queue does not raise the banner.
      return { engaged: s.brake.queuedTotal >= TOKEN_UNIT, queued: s.brake.queuedTotal, supply: chain.coin.supply, windowEndsAt: endsAt };
    }
    if (coin) {
      return { engaged: coin.brake.engaged && BigInt(coin.brake.queued || "0") >= TOKEN_UNIT, queued: BigInt(coin.brake.queued || "0"), supply: BigInt(coin.supply || "0"), windowEndsAt: coin.brake.window ? Date.parse(coin.brake.window.eta_ts) : null };
    }
    return null;
  }, [chain.coin, coin]);

  const openSheet = (k: TradeTab) => {
    setTradeTab(k);
    setSheet(true);
  };

  const exitAtFloor = () => {
    if (!coin) return;
    if (!account.connected) {
      setWalletOpen(true);
      return;
    }
    const q = chain.user?.queue;
    if (q && q.remaining > 0n && !q.stale) {
      tx.run({ kind: "queueToRedeem", mint, symbol: coin.symbol }, { onDone: chain.refresh });
      return;
    }
    const bal = chain.user?.balance ?? 0n;
    if (bal > 0n) {
      tx.run({ kind: "redeem", mint, symbol: coin.symbol, tokens: bal }, { onDone: chain.refresh });
      return;
    }
    setTradeTab("redeem");
    setSheet(true);
  };

  if (m && m.phase !== lastPhase) {
    if (lastPhase === "curve" && m.phase === "graduated" && slabShouldPlay(mint)) setLanded(true);
    setLastPhase(m.phase);
  }

  if (!coin || !m) {
    if (chain.loading || (!chain.missing && !chain.error)) return <CoinSkeleton />;
    return (
      <div className="gutter mx-auto max-w-[720px] py-24">
        <h1 className="text-2xl">{t("notFound")}</h1>
        <EmptyState className="mt-4 text-md">{chain.error ? t("rpcError", { rpc: ENV.rpcUrl }) : t("notFoundHint", { cluster: ENV.cluster })}</EmptyState>
        <ButtonLink href="/" variant="secondary" className="mt-6">
          {t("back")}
        </ButtonLink>
      </div>
    );
  }

  const graduated = m.phase === "graduated";
  const landing = landed && graduated;
  const chartEmpty = !api.available ? t("noHistory") : null;
  const feedEmpty = !api.available ? t("noFeed") : undefined;

  return (
    <div className="pb-28 lg:pb-0">
      {brake ? <BrakeBanner info={brake} onExit={exitAtFloor} exitDisabled={!graduated} /> : null}
      <div className="mx-auto w-full max-w-[1280px] px-4 pt-8 sm:px-6 lg:pt-10">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="min-w-0 space-y-5 lg:col-span-8">
            <CoinHeader coin={coin} m={m} />
            {landing ? (
              <div className="patch-card relative p-6" role="status">
                <button type="button" onClick={() => setLanded(false)} className="absolute right-5 top-4 z-10 text-xs font-semibold text-ink-2 hover:text-ink">
                  {t("closeLanding")}
                </button>
                <p className="text-center font-display text-lg font-semibold">{t("graduatedNow", { symbol: coin.symbol })}</p>
                <SlabLands floorSol={m.floorSol} />
              </div>
            ) : null}
            <Chart
              candles={candles}
              interval={interval}
              onInterval={changeInterval}
              floorNow={m.floorSol}
              floorActive={graduated}
              floorPreview={m.floorPreviewSol}
              height={{ mobile: 360, desktop: 520 }}
              loading={candlesLoading}
              emptyNote={chartEmpty}
            />
            <KeyNumbers coin={{ ...coin, total_redeemed_sol: chain.coin ? chain.coin.state.totalRedeemedSol.toString() : coin.total_redeemed_sol }} m={m} className="lg:hidden" />
            <div>
              <Tabs
                idPrefix="coin"
                value={tab}
                onChange={openTab}
                className="no-scrollbar overflow-x-auto"
                items={[
                  { key: "trades", label: t("tabTrades") },
                  { key: "holders", label: t("tabHolders") },
                  { key: "queue", label: brake?.engaged ? t("tabQueueLive") : t("tabQueue") },
                  { key: "about", label: t("tabAbout") },
                ]}
              />
              <TabPanel idPrefix="coin" k={tab} className="pt-4">
                {tab === "trades" ? <TradesFeed trades={trades} freshKeys={fresh} symbol={coin.symbol} emptyNote={feedEmpty} /> : null}
                {tab === "holders" ? <Holders data={holders} m={m} symbol={coin.symbol} /> : null}
                {tab === "queue" ? <QueuePanel queue={queue} chain={chain.coin} user={chain.user} mint={mint} symbol={coin.symbol} connected={account.connected} onDone={chain.refresh} /> : null}
                {tab === "about" ? <AboutCoin coin={coin} chain={chain.coin} /> : null}
              </TabPanel>
            </div>
          </div>

          <aside className="min-w-0 lg:col-span-4">
            <div className="space-y-4 lg:sticky lg:top-[88px]">
              {/* One TradePanel: a bottom sheet under lg, the sticky column above. */}
              <div
                className={cn(
                  "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-[70] max-lg:max-h-[88dvh] max-lg:overflow-y-auto max-lg:rounded-t-[24px] max-lg:border-x max-lg:border-t max-lg:border-line-2 max-lg:bg-card max-lg:pb-[env(safe-area-inset-bottom)]",
                  "max-lg:transition-transform max-lg:duration-300 max-lg:ease-[cubic-bezier(0.32,0.72,0,1)]",
                  sheet ? "max-lg:translate-y-0" : "max-lg:pointer-events-none max-lg:translate-y-full max-lg:invisible",
                )}
              >
                <span aria-hidden className="mx-auto mt-2.5 block h-1 w-10 rounded-full bg-line-2 lg:hidden" />
                <div className="flex items-center justify-between px-4 pb-1 pt-1 lg:hidden">
                  <span className="text-md font-bold">{t("tradeSheet", { symbol: coin.symbol })}</span>
                  <button type="button" onClick={() => setSheet(false)} className="press -mr-2 grid size-11 place-items-center rounded-full text-ink-2 hover:text-ink" aria-label={t("closeSheet")}>
                    <X size={18} />
                  </button>
                </div>
                <div className="max-lg:px-4 max-lg:pb-4">
                  <TradePanel symbol={coin.symbol} mint={mint} chain={chain.coin} user={chain.user} tab={tradeTab} onTab={setTradeTab} onDone={chain.refresh} />
                </div>
              </div>
              <BagFloorBox chain={chain.coin} user={chain.user} symbol={coin.symbol} connected={account.connected} />
              <KeyNumbers coin={{ ...coin, total_redeemed_sol: chain.coin ? chain.coin.state.totalRedeemedSol.toString() : coin.total_redeemed_sol }} m={m} className="hidden lg:grid" />
              {!ENV.mock && chain.error ? <p className="text-xs text-ink-3">{t("rpcStale")}</p> : null}
            </div>
          </aside>
        </div>
      </div>

      {sheet ? <button type="button" aria-label={t("closeSheet")} onClick={() => setSheet(false)} className="fixed inset-0 z-[65] bg-[color-mix(in_oklab,var(--ink)_45%,transparent)] lg:hidden" /> : null}

      {/* Mobile: the trade panel is one tap away, never below the chart. */}
      <div className="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-[60] lg:hidden">
        <div className="plate grid grid-cols-3 gap-2 p-2">
          <Button variant="secondary" onClick={() => openSheet("buy")}>
            {t("barBuy")}
          </Button>
          <Button variant="secondary" onClick={() => openSheet("sell")}>
            {t("barSell")}
          </Button>
          <Button variant="primary" onClick={() => openSheet("redeem")}>
            {t("barRedeem")}
          </Button>
        </div>
      </div>
      <WalletModal open={walletOpen} onClose={() => setWalletOpen(false)} />
    </div>
  );
}

function CoinSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pt-8 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-12">
        <div className="space-y-5 lg:col-span-8">
          <div className="flex gap-4">
            <Skeleton className="size-16" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-72" />
            </div>
          </div>
          <Skeleton className="h-[360px] lg:h-[560px]" />
        </div>
        <div className="space-y-4 lg:col-span-4">
          <Skeleton className="h-[420px]" />
          <Skeleton className="h-32" />
        </div>
      </div>
    </div>
  );
}
