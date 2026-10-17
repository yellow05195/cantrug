"use client";
import { coinFloorQ64, coinPriceQ64, priceFloorGapPct, redeemQuote, valueAtQ64 } from "@floored/sdk";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CoinAvatar, Skeleton } from "@/components/ui/Bits";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { gapText } from "@/components/ui/Floor";
import { toast } from "@/components/ui/Toaster";
import { ConnectPrompt } from "@/components/wallet/WalletButton";
import { api } from "@/lib/api/client";
import { subscribe } from "@/lib/api/ws";
import { readPositions, type Position } from "@/lib/chain/portfolio";
import { readTokenMeta } from "@/lib/chain/reads";
import { ENV, explorerTx } from "@/lib/env";
import { sol, tokens } from "@/lib/format";
import { errorKey } from "@/lib/tx/errors";
import type { Prepared, TxAction } from "@/lib/tx/types";
import { useAccount } from "@/lib/wallet/account";

interface Row extends Position {
  name: string;
  symbol: string;
  image: string | null;
  atPrice: bigint;
  atFloor: bigint;
  gapPct: number | null;
}

export function PortfolioView() {
  const t = useTranslations("portfolio");
  const tf = useTranslations("floor");
  const te = useTranslations("errors");
  const account = useAccount();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!account.address) return;
    try {
      const pos = await readPositions(account.address);
      const enriched = await Promise.all(
        pos.map(async (p): Promise<Row> => {
          const row = api.available ? await api.coin(p.mint).catch(() => null) : null;
          const meta = row ? null : await readTokenMeta(p.mint).catch(() => null);
          const graduated = p.state.phase === 1;
          let atFloor = 0n;
          if (graduated && p.balance > 0n) {
            try {
              atFloor = redeemQuote(p.state, p.supply, p.balance).solOut;
            } catch {
              atFloor = 0n;
            }
          }
          const pq = coinPriceQ64(p.state);
          const fq = coinFloorQ64(p.state, p.supply);
          return {
            ...p,
            name: row?.name ?? meta?.name ?? p.mint.slice(0, 6),
            symbol: row?.symbol ?? meta?.symbol ?? "?",
            image: row?.image_url ?? meta?.image ?? null,
            atPrice: valueAtQ64(pq, p.balance),
            atFloor,
            gapPct: graduated ? priceFloorGapPct(pq, fq) : null,
          };
        }),
      );
      enriched.sort((a, b) => (b.atFloor > a.atFloor ? 1 : b.atFloor < a.atFloor ? -1 : b.atPrice > a.atPrice ? 1 : -1));
      setRows(enriched);
      setError(null);
    } catch (e) {
      setError(errorKey(e));
    }
  }, [account.address]);

  useEffect(() => {
    if (!account.address) return;
    const first = setTimeout(() => void load(), 0);
    let tm: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribe("*", () => {
      if (tm) clearTimeout(tm);
      tm = setTimeout(() => void load(), 1500);
    });
    return () => {
      clearTimeout(first);
      if (tm) clearTimeout(tm);
      unsub();
    };
  }, [account.address, load]);

  if (!account.connected) {
    return (
      <EmptyState className="mx-auto max-w-md text-center">
        <div className="flex flex-col items-center gap-4">
          <p className="text-md text-ink-2">{t("connect")}</p>
          <ConnectPrompt />
        </div>
      </EmptyState>
    );
  }

  if (error) return <p className="text-md text-down">{te(error as Parameters<typeof te>[0])}</p>;

  if (!rows) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <EmptyState className="mx-auto max-w-lg text-center">
      <div className="space-y-4">
        <p className="text-md">{t("empty")}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <ButtonLink href="/" variant="primary">
            {t("buyOne")}
          </ButtonLink>
          <ButtonLink href="/create" variant="secondary">
            {t("launch")}
          </ButtonLink>
        </div>
      </div>
      </EmptyState>
    );
  }

  const redeemable = rows.filter((r) => r.state.phase === 1 && r.balance > 0n && r.atFloor > 0n);
  const totalFloor = redeemable.reduce((a, r) => a + r.atFloor, 0n);
  const totalPrice = rows.reduce((a, r) => a + r.atPrice, 0n);

  const redeemAll = async () => {
    setRunError(null);
    setRunning({ done: 0, total: redeemable.length });
    let received = 0n;
    let lastSig = "";
    try {
      for (let i = 0; i < redeemable.length; i++) {
        const r = redeemable[i]!;
        const action: TxAction = { kind: "redeem", mint: r.mint, symbol: r.symbol, tokens: r.balance };
        let p: Prepared;
        if (ENV.mock) p = await (await import("@/lib/tx/mock")).prepareMock(action, account.address!);
        else p = await (await import("@/lib/tx/live")).prepareLive(action, { address: account.address!, send: account.send! });
        const res = await p.execute();
        received += res.outcome.solOut;
        lastSig = res.signature;
        setRunning({ done: i + 1, total: redeemable.length });
      }
      toast({ kind: "success", floor: true, title: t("redeemedAll", { sol: sol(received), n: redeemable.length }), href: ENV.mock ? undefined : explorerTx(lastSig), hrefLabel: t("explorer") });
      setConfirm(false);
      void load();
    } catch (e) {
      setRunError(errorKey(e));
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-ink-2">{t("totalFloor")}</p>
          <p className="num mt-1 text-4xl text-floor">
            {sol(totalFloor)} <span className="text-xl text-floor/70">SOL</span>
          </p>
          <p className="mt-1 text-sm text-ink-3">{t("totalPrice", { sol: sol(totalPrice) })}</p>
        </div>
        <Button variant="floor" size="lg" disabled={!redeemable.length} onClick={() => setConfirm(true)}>
          {t("redeemAll")}
        </Button>
      </div>

      {/* Phones: one block per coin, value at floor first. */}
      <ul className="patch-card divide-y divide-dashed divide-seam overflow-hidden px-2 py-1 md:hidden">
        {rows.map((r) => (
          <li key={r.mint}>
            <Link href={`/coin/${r.mint}`} className="flex gap-3 p-4">
              <CoinAvatar src={r.image} symbol={r.symbol} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{r.name}</span>
                  <span className="num shrink-0 text-floor">{r.state.phase === 1 ? `${sol(r.atFloor)} SOL` : tf("atGraduationShort")}</span>
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-ink-2">
                  <span className="num">
                    {tokens(r.balance)} ${r.symbol}
                  </span>
                  <span className="num">{t("totalPrice", { sol: sol(r.atPrice) })}</span>
                </div>
                {r.state.phase === 1 ? <p className="mt-1 text-xs text-ink-3">{gapText(tf, r.gapPct)}</p> : null}
                {r.queue ? <p className="num mt-1 text-xs text-ink-2">{r.queue.stale ? t("staleQueue") : `${t("colQueue")}: ${tokens(r.queue.remaining)} / ${sol(r.queue.owed, 3)} SOL`}</p> : null}
              </div>
            </Link>
          </li>
        ))}
        <li className="flex items-baseline justify-between p-4 text-sm">
          <span className="font-medium">{t("total")}</span>
          <span className="num text-floor">{sol(totalFloor)} SOL</span>
        </li>
      </ul>

      <div className="patch-card hidden overflow-x-auto p-3 md:block md:p-4">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="h-11 text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
              <th className="pl-4 font-medium">{t("colCoin")}</th>
              <th className="text-right font-medium">{t("colBalance")}</th>
              <th className="text-right font-medium">{t("colPrice")}</th>
              <th className="text-right font-medium">
                <span className="text-floor">{t("colFloor")}</span>
                <span className="block normal-case tracking-normal text-ink-3">{t("colFloorHint")}</span>
              </th>
              <th className="text-right font-medium">{t("colGap")}</th>
              <th className="pr-4 text-right font-medium">{t("colQueue")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.mint} className="hover-row h-14 border-t border-dashed border-seam">
                <td className="pl-4">
                  <Link href={`/coin/${r.mint}`} className="flex items-center gap-3">
                    <CoinAvatar src={r.image} symbol={r.symbol} size={36} />
                    <span>
                      <span className="block font-display font-semibold">{r.name}</span>
                      <span className="num block text-xs text-ink-2">${r.symbol}</span>
                    </span>
                  </Link>
                </td>
                <td className="num text-right">{tokens(r.balance)}</td>
                <td className="num text-right">{sol(r.atPrice)} SOL</td>
                <td className="num text-right text-floor">{r.state.phase === 1 ? `${sol(r.atFloor)} SOL` : <span className="text-ink-3">{tf("atGraduationShort")}</span>}</td>
                <td className="text-right text-ink-2">{r.state.phase === 1 ? gapText(tf, r.gapPct) : ""}</td>
                <td className="num pr-4 text-right text-ink-2">{r.queue ? (r.queue.stale ? t("staleQueue") : `${tokens(r.queue.remaining)} / ${sol(r.queue.owed, 3)} SOL`) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="h-12 border-t-2 border-dashed border-seam text-sm">
              <td className="pl-4 font-medium">{t("total")}</td>
              <td />
              <td className="num text-right">{sol(totalPrice)} SOL</td>
              <td className="num text-right text-floor">{sol(totalFloor)} SOL</td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <Dialog open={confirm} onClose={() => !running && setConfirm(false)} title={t("redeemAll")} closeLabel={t("close")} dismissable={!running}>
        <div className="space-y-4">
          <p className="num text-3xl text-floor">{sol(totalFloor)} SOL</p>
          <p className="text-md">{t("confirmAll", { sol: sol(totalFloor), n: redeemable.length })}</p>
          <p className="text-sm text-ink-2">{ENV.mock ? t("mockNote") : t("oneEach", { wallet: account.walletName })}</p>
          {runError ? <p className="text-sm text-down">{te(runError as Parameters<typeof te>[0])}</p> : null}
          <div className="flex gap-2">
            <Button variant="secondary" size="lg" className="flex-1" disabled={Boolean(running)} onClick={() => setConfirm(false)}>
              {t("cancel")}
            </Button>
            <Button variant="floor" size="lg" className="flex-[2]" loading={Boolean(running)} onClick={() => void redeemAll()}>
              {t("confirmButton")}
            </Button>
          </div>
          {running ? <p className="num text-xs text-ink-3">{t("progress", { done: running.done, total: running.total })}</p> : null}
        </div>
      </Dialog>
    </div>
  );
}
