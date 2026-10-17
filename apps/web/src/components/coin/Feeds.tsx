"use client";
import { valueAtQ64 } from "@floored/sdk";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Age } from "@/components/ui/Bits";
import { Button } from "@/components/ui/Button";
import { Num } from "@/components/ui/Num";
import type { HoldersJson, QueueJson, TradeJson } from "@/lib/api/types";
import type { CoinChain, UserChain } from "@/lib/chain/reads";
import type { CoinMetrics } from "@/lib/coin/metrics";
import { cn } from "@/lib/cn";
import { explorerAddress, explorerTx } from "@/lib/env";
import { bpsPct, shortAddress, sol, tokens } from "@/lib/format";
import { useTx } from "@/lib/tx/TxProvider";

const ROW_H = 36;

function glyph(tr: TradeJson): { g: string; cls: string; key: "buy" | "sell" | "fill" | "redeem" } {
  if (tr.kind === "redeem") return { g: "◆", cls: "text-floor", key: "redeem" };
  if (tr.is_queue_fill) return { g: "●", cls: "text-ink-2", key: "fill" };
  return tr.side === "buy" ? { g: "▲", cls: "text-up", key: "buy" } : { g: "▼", cls: "text-down", key: "sell" };
}

function TradeRow({ tr, fresh, symbol, style }: { tr: TradeJson; fresh: boolean; symbol: string; style?: React.CSSProperties }) {
  const t = useTranslations("feed");
  const g = glyph(tr);
  const queued = BigInt(tr.queued_remainder || "0");
  return (
    <div
      style={style}
      className={cn(
        "grid h-9 grid-cols-[1.25rem_4.5rem_1fr_1fr_5rem_2.5rem] items-center gap-2 border-b border-line/70 px-3 text-sm sm:grid-cols-[1.25rem_5.5rem_1fr_1fr_6.5rem_3rem]",
        fresh && (g.key === "buy" ? "row-in-up" : g.key === "redeem" ? "row-in-floor" : g.key === "sell" ? "row-in-down" : "row-in-floor"),
      )}
    >
      <span aria-hidden className={cn("text-xs", g.cls)}>
        {g.g}
      </span>
      <span className={cn("truncate", g.key === "redeem" ? "text-floor" : "text-ink-2")}>{t(g.key)}</span>
      <span className="num truncate text-right">{sol(BigInt(tr.sol_amount), 4)}</span>
      <span className="num truncate text-right text-ink-2">
        {tokens(BigInt(tr.token_amount))}
        {queued > 0n ? <span className="ml-1 text-ink-3">+{tokens(queued)}q</span> : null}
        <span className="sr-only"> {symbol}</span>
      </span>
      <a href={tr.user === "queue" ? explorerTx(tr.signature) : explorerAddress(tr.user)} target="_blank" rel="noreferrer" className="num truncate text-right text-ink-3 hover:text-ink">
        {tr.user === "queue" ? t("queue") : shortAddress(tr.user, 4)}
      </a>
      <Age ts={tr.ts} className="text-right text-xs text-ink-3" />
    </div>
  );
}

/** Dense live trades. Windowed rendering kicks in above 200 rows. */
export function TradesFeed({ trades, freshKeys, symbol, emptyNote }: { trades: TradeJson[]; freshKeys: Set<string>; symbol: string; emptyNote?: string }) {
  const t = useTranslations("feed");
  const scroller = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const virtual = trades.length > 200;
  const viewH = 540;
  const start = virtual ? Math.max(0, Math.floor(top / ROW_H) - 8) : 0;
  const end = virtual ? Math.min(trades.length, start + Math.ceil(viewH / ROW_H) + 16) : trades.length;
  const key = (tr: TradeJson) => `${tr.signature}:${tr.event_index}:${tr.kind ?? "t"}`;

  if (!trades.length) return <p className="rounded-xl border-2 border-dashed border-stroke p-4 text-sm text-ink-2">{emptyNote ?? t("empty")}</p>;

  return (
    <div className="sticker overflow-hidden">
      <div className="grid h-9 bg-bg-3 grid-cols-[1.25rem_4.5rem_1fr_1fr_5rem_2.5rem] items-center gap-2 border-b-2 border-stroke px-3 text-xs font-semibold text-ink-3 sm:grid-cols-[1.25rem_5.5rem_1fr_1fr_6.5rem_3rem]">
        <span />
        <span>{t("side")}</span>
        <span className="text-right">SOL</span>
        <span className="text-right">{symbol}</span>
        <span className="text-right">{t("wallet")}</span>
        <span className="text-right">{t("age")}</span>
      </div>
      <div ref={scroller} onScroll={virtual ? (e) => setTop(e.currentTarget.scrollTop) : undefined} className="max-h-[540px] overflow-y-auto">
        {virtual ? (
          <div style={{ height: trades.length * ROW_H, position: "relative" }}>
            {trades.slice(start, end).map((tr, i) => (
              <TradeRow key={key(tr)} tr={tr} fresh={freshKeys.has(key(tr))} symbol={symbol} style={{ position: "absolute", top: (start + i) * ROW_H, left: 0, right: 0 }} />
            ))}
          </div>
        ) : (
          trades.map((tr) => <TradeRow key={key(tr)} tr={tr} fresh={freshKeys.has(key(tr))} symbol={symbol} />)
        )}
      </div>
    </div>
  );
}

export function Holders({ data, m, symbol }: { data: HoldersJson | null; m: CoinMetrics; symbol: string }) {
  const t = useTranslations("holders");
  if (!data || !data.items.length) return <p className="rounded-xl border-2 border-dashed border-stroke p-4 text-sm text-ink-2">{t("empty")}</p>;
  const fq = m.phase === "graduated" ? m.floorQ64 : 0n;
  return (
    <div className="overflow-x-auto rounded-xl border-2 border-stroke">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="h-9 border-b-2 border-stroke bg-bg-3 text-left text-xs font-semibold text-ink-3">
            <th className="w-10 pl-3 font-normal">#</th>
            <th className="font-normal">{t("wallet")}</th>
            <th className="text-right font-normal">{symbol}</th>
            <th className="text-right font-normal">{t("share")}</th>
            <th className="pr-3 text-right font-normal">{t("atFloor")}</th>
          </tr>
        </thead>
        <tbody>
          {data.items.slice(0, 25).map((h, i) => {
            const bal = BigInt(h.balance);
            return (
              <tr key={h.owner} className="h-9 border-b border-line/60 last:border-0">
                <td className="num pl-3 text-ink-3">{i + 1}</td>
                <td>
                  <a href={explorerAddress(h.owner)} target="_blank" rel="noreferrer" className="num text-ink-2 hover:text-ink">
                    {shortAddress(h.owner, 5)}
                  </a>
                </td>
                <td className="num text-right">{tokens(bal)}</td>
                <td className="num text-right text-ink-2">{h.share_of_supply_bps !== null ? `${bpsPct(h.share_of_supply_bps)} %` : ""}</td>
                <td className="num pr-3 text-right text-floor">{fq > 0n ? `${sol(valueAtQ64(fq, bal), 3)} SOL` : <span className="text-ink-3">{t("notYet")}</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function QueuePanel({ queue, chain, user, mint, symbol, connected, onDone }: { queue: QueueJson | null; chain: CoinChain | null; user: UserChain | null; mint: string; symbol: string; connected: boolean; onDone: () => void }) {
  const t = useTranslations("queue");
  const tx = useTx();
  const st = user?.queue ?? null;
  const brake = chain?.state.brake;
  const queued = brake?.queuedTotal ?? BigInt(queue?.brake.queued ?? "0");
  const lastFill = queue?.recent.find((r) => r.kind === "processed");
  const supply = chain?.supply ?? 0n;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="sticker p-4" aria-labelledby="q-you">
        <h3 id="q-you" className="text-md font-semibold">
          {t("yours")}
        </h3>
        {!connected ? (
          <p className="mt-2 text-sm text-ink-2">{t("connect")}</p>
        ) : !st ? (
          <p className="mt-2 text-sm text-ink-2">{t("none")}</p>
        ) : (
          <>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-ink-3">{t("left")}</dt>
                <dd className="num mt-0.5 text-md">
                  {tokens(st.remaining)} <span className="text-ink-3">{symbol}</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-ink-3">{t("earned")}</dt>
                <dd className="num mt-0.5 text-md">{sol(st.owed)} SOL</dd>
              </div>
            </dl>
            {st.stale ? <p className="mt-2 text-xs text-ink-2">{t("stale")}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" disabled={st.owed === 0n || tx.busy} onClick={() => tx.run({ kind: "claim", mint, symbol }, { onDone })}>
                {t("claim")}
              </Button>
              <Button size="sm" variant="secondary" disabled={tx.busy} onClick={() => tx.run({ kind: "cancel", mint, symbol }, { onDone })}>
                {t("cancel")}
              </Button>
              {st.remaining > 0n && chain?.state.phase === 1 ? (
                <Button size="sm" variant="floor" disabled={tx.busy} onClick={() => tx.run({ kind: "queueToRedeem", mint, symbol }, { onDone })}>
                  {t("toFloor")}
                </Button>
              ) : null}
            </div>
          </>
        )}
      </section>
      <section className="sticker p-4" aria-labelledby="q-public">
        <h3 id="q-public" className="text-md font-semibold">
          {t("public")}
        </h3>
        <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs text-ink-3">{t("total")}</dt>
            <dd className="num mt-0.5">{tokens(queued)}</dd>
            {supply > 0n && queued > 0n ? <dd className="num text-xs text-ink-3">{bpsPct(Number((queued * 10_000n) / supply))} %</dd> : null}
          </div>
          <div>
            <dt className="text-xs text-ink-3">{t("filled")}</dt>
            <dd className="num mt-0.5">{lastFill?.amount ? tokens(BigInt(lastFill.amount)) : "0"}</dd>
            {lastFill?.sol_amount ? <dd className="num text-xs text-ink-3">{sol(BigInt(lastFill.sol_amount), 3)} SOL</dd> : null}
          </div>
          <div>
            <dt className="text-xs text-ink-3">{t("windows")}</dt>
            <dd className="num mt-0.5">{brake?.windowsProcessed ?? 0}</dd>
          </div>
        </dl>
        {queue?.entries.length ? (
          <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
            {queue.entries.slice(0, 8).map((e) => (
              <li key={e.user} className="flex justify-between gap-2">
                <span className="num text-ink-2">{shortAddress(e.user)}</span>
                <Num>{tokens(BigInt(e.queued_estimate))}</Num>
              </li>
            ))}
          </ul>
        ) : null}
        {queued === 0n ? <p className="mt-3 text-sm text-ink-2">{t("empty")}</p> : null}
      </section>
    </div>
  );
}

/** Keep fresh-row keys for 1 s so new trades flash once. */
export function useFreshKeys(): [Set<string>, (k: string) => void] {
  const [keys, setKeys] = useState<Set<string>>(() => new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);
  const add = (k: string) => {
    setKeys((s) => new Set(s).add(k));
    timers.current.set(
      k,
      setTimeout(() => {
        setKeys((s) => {
          const n = new Set(s);
          n.delete(k);
          return n;
        });
        timers.current.delete(k);
      }, 1000),
    );
  };
  return [keys, add];
}

