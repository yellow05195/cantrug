"use client";
import { Broadcast } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BuildingAvatar } from "@/components/coin/BuildingAvatar";
import { Dialog } from "@/components/ui/Dialog";
import { api } from "@/lib/api/client";
import type { WsRedeemed, WsTrade } from "@/lib/api/types";
import { subscribe } from "@/lib/api/ws";
import { cn } from "@/lib/cn";
import { age, shortAddress, sol } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";

interface Tick {
  id: string;
  mint: string;
  kind: "buy" | "sell" | "fill" | "redeem";
  lamports: bigint;
  ms: number;
  /** Arrived on the websocket after mount: slides in. */
  fresh?: boolean;
}

const MAX = 24;

/**
 * The live ticker (DESIGN.md v2 motion 3): the site's single marquee. Last
 * trades across every coin, 45 s per loop, paused on hover, new items slide in
 * from the left edge in 160 ms. Below md it collapses to a "live" chip.
 */
export function LiveTicker() {
  const t = useTranslations("ticker");
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [symbols, setSymbols] = useState<Map<string, string>>(new Map());
  const [open, setOpen] = useState(false);
  const now = useNow(10_000);

  useEffect(() => {
    if (!api.available) return;
    let live = true;
    (async () => {
      const list = await api.coins({ sort: "volume", limit: 40 }).catch(() => null);
      if (!list || !live) return;
      setSymbols(new Map(list.items.map((c) => [c.mint, c.symbol])));
      const top = list.items.slice(0, 5);
      const batches = await Promise.all(top.map((c) => api.trades(c.mint, 6).catch(() => null)));
      if (!live) return;
      const seed: Tick[] = [];
      batches.forEach((b, i) => {
        for (const tr of b?.items ?? []) {
          seed.push({
            id: `${tr.signature}:${tr.event_index}`,
            mint: top[i]!.mint,
            kind: tr.kind === "redeem" ? "redeem" : tr.is_queue_fill ? "fill" : tr.side,
            lamports: BigInt(tr.sol_amount),
            ms: Date.parse(tr.ts),
          });
        }
      });
      seed.sort((a, b) => b.ms - a.ms);
      setTicks((cur) => (cur.length ? cur : seed.slice(0, MAX)));
    })();
    return () => {
      live = false;
    };
  }, []);

  useEffect(
    () =>
      subscribe("*", (m) => {
        let tick: Tick | null = null;
        if (m.type === "Trade") {
          const d = m.data as unknown as WsTrade;
          tick = { id: `${m.signature}:t`, mint: m.mint, kind: d.is_queue_fill ? "fill" : d.is_buy ? "buy" : "sell", lamports: BigInt(d.sol_amount), ms: Date.parse(m.ts) };
        } else if (m.type === "Redeemed") {
          const d = m.data as unknown as WsRedeemed;
          tick = { id: `${m.signature}:r`, mint: m.mint, kind: "redeem", lamports: BigInt(d.sol_out), ms: Date.parse(m.ts) };
        }
        if (!tick || tick.lamports === 0n) return;
        tick.fresh = true;
        setTicks((cur) => [tick!, ...cur.filter((x) => x.id !== tick!.id)].slice(0, MAX));
      }),
    [],
  );

  const items = ticks;
  const label = (x: Tick) => symbols.get(x.mint) ?? shortAddress(x.mint, 3);

  const renderItem = (x: Tick, dup?: boolean) => (
    <Link
      key={dup ? `d-${x.id}` : x.id}
      href={`/coin/${x.mint}`}
      prefetch={false}
      tabIndex={dup ? -1 : undefined}
      aria-hidden={dup || undefined}
      className={cn("flex shrink-0 items-center gap-2 rounded-full px-2 py-1 text-xs hover:bg-bg-3", !dup && x.fresh && "ticker-new")}
    >
      <BuildingAvatar seed={x.mint} size={22} className="rounded-md! border" />
      <span className="num font-medium text-ink">${label(x)}</span>
      <span className={cn("num", x.kind === "buy" ? "text-up" : x.kind === "redeem" ? "text-floor" : x.kind === "fill" ? "text-ink-2" : "text-down")}>
        {x.kind === "buy" ? "▲" : x.kind === "redeem" ? "◆" : x.kind === "fill" ? "●" : "▼"} {sol(x.lamports, 3)}
      </span>
      <span className="num text-ink-3" suppressHydrationWarning>
        {age(x.ms, now)}
      </span>
    </Link>
  );

  return (
    <>
      <div className="ticker relative hidden h-9 overflow-hidden border-b border-stroke bg-bg-2 md:block" aria-label={t("label")} role="region">
        <div className="absolute inset-y-0 left-0 z-10 flex items-center gap-1.5 border-r border-stroke bg-bg-2 pl-4 pr-3 text-xs font-semibold text-floor">
          <span className="relative flex size-2">
            <span className="absolute inset-0 rounded-full bg-floor opacity-60 motion-safe:animate-ping" />
            <span className="relative size-2 rounded-full bg-floor" />
          </span>
          {t("live")}
        </div>
        {items.length ? (
          <div className="ticker-track flex w-max items-center gap-3 py-1 pl-24">
            {items.map((x) => renderItem(x))}
            {items.map((x) => renderItem(x, true))}
          </div>
        ) : (
          <p className="flex h-full items-center pl-24 text-xs text-ink-3">{api.available ? t("waiting") : t("noIndexer")}</p>
        )}
      </div>
      {/* Below md the ticker collapses to a "live" chip showing the latest trade; it opens the feed. */}
      <button type="button" onClick={() => setOpen(true)} className="flex h-9 w-full items-center gap-2 overflow-hidden border-b border-stroke bg-bg-2 px-4 text-left md:hidden" aria-label={t("open")}>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-floor/50 bg-floor-dim px-2 py-0.5 text-xs font-semibold text-floor">
          <Broadcast size={14} weight="regular" /> {t("live")}
        </span>
        <span className="min-w-0 flex-1 truncate">{items[0] ? <span key={items[0].id} className="ticker-new inline-flex">{renderItem(items[0], true)}</span> : <span className="text-xs text-ink-3">{api.available ? t("waiting") : t("noIndexer")}</span>}</span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("title")} closeLabel={t("close")}>
        {items.length ? (
          <ul className="-mx-2 flex flex-col">
            {items.slice(0, 16).map((x) => (
              <li key={x.id} onClick={() => setOpen(false)}>
                {renderItem(x)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-2">{api.available ? t("waiting") : t("noIndexer")}</p>
        )}
      </Dialog>
    </>
  );
}
