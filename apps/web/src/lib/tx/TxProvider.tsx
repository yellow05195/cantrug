"use client";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Dashes } from "@/components/ui/Dashes";
import { Dialog } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toaster";
import { ENV, explorerTx } from "@/lib/env";
import { pct, sol, tokens } from "@/lib/format";
import { useAccount } from "@/lib/wallet/account";
import { errorKey, TxError } from "./errors";
import type { Outcome, Prepared, TxAction } from "./types";

type Phase = "idle" | "preparing" | "ready" | "sending" | "error";

interface RunOptions {
  onDone?: (r: { signature: string; outcome: Outcome }) => void;
}

interface TxApi {
  run: (action: TxAction, opts?: RunOptions) => void;
  busy: boolean;
}

const Ctx = createContext<TxApi | null>(null);

export function useTx(): TxApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTx outside TxProvider");
  return v;
}

function shareOf(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  return Number((part * 10_000n) / whole) / 100;
}

export function TxProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("tx");
  const te = useTranslations("errors");
  const account = useAccount();
  const [phase, setPhase] = useState<Phase>("idle");
  const [action, setAction] = useState<TxAction | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [error, setError] = useState<string | null>(null);
  const opts = useRef<RunOptions>({});
  const runId = useRef(0);

  const prepare = useCallback(
    async (a: TxAction) => {
      const id = ++runId.current;
      setPhase("preparing");
      setError(null);
      setPrepared(null);
      try {
        if (!account.address) throw new TxError("noWallet");
        let p: Prepared;
        if (ENV.mock) {
          const { prepareMock } = await import("./mock");
          p = await prepareMock(a, account.address);
        } else {
          if (!account.send) throw new TxError("noWallet");
          const { prepareLive } = await import("./live");
          p = await prepareLive(a, { address: account.address, send: account.send });
        }
        if (id !== runId.current) return;
        setPrepared(p);
        setPhase("ready");
      } catch (e) {
        if (id !== runId.current) return;
        setError(errorKey(e));
        setPhase("error");
      }
    },
    [account.address, account.send],
  );

  const run = useCallback(
    (a: TxAction, o: RunOptions = {}) => {
      opts.current = o;
      setAction(a);
      void prepare(a);
    },
    [prepare],
  );

  const close = useCallback(() => {
    runId.current++;
    setPhase("idle");
    setPrepared(null);
    setError(null);
  }, []);

  const confirm = useCallback(async () => {
    if (!prepared || !action) return;
    setPhase("sending");
    try {
      const res = await prepared.execute();
      const o = res.outcome;
      const symbol = o.symbol;
      const title = (() => {
        switch (o.kind) {
          case "buy":
            return t("done.buy", { tokens: tokens(o.tokensOut), symbol });
          case "sell":
            return o.queued > 0n ? t("done.sellQueued", { sol: sol(o.solOut), tokens: tokens(o.queued) }) : t("done.sell", { sol: sol(o.solOut) });
          case "redeem":
            return t("done.redeem", { sol: sol(o.solOut) });
          case "claim":
            return t("done.claim", { sol: sol(o.solOut) });
          case "cancel":
            return t("done.cancel", { sol: sol(o.solOut), tokens: tokens(o.tokensOut), symbol });
          case "queueToRedeem":
            return t("done.queueToRedeem", { sol: sol(o.solOut) });
          case "create":
            return t("done.create", { symbol });
          case "crank":
            return t("done.crank", { sol: sol(o.crankReward) });
          case "graduate":
            return t("done.graduate", { symbol });
        }
      })();
      toast({
        kind: "success",
        title,
        floor: o.kind === "redeem" || o.kind === "queueToRedeem",
        href: ENV.mock ? undefined : explorerTx(res.signature),
        hrefLabel: t("viewExplorer"),
        body: ENV.mock ? t("mockNote") : undefined,
      });
      setPhase("idle");
      setPrepared(null);
      opts.current.onDone?.(res);
    } catch (e) {
      setError(errorKey(e));
      setPhase("error");
    }
  }, [prepared, action, t]);

  const api = useMemo<TxApi>(() => ({ run, busy: phase !== "idle" }), [run, phase]);

  const wallet = account.isDemo ? t("demoWallet") : account.walletName;
  const o = prepared?.outcome;
  const title = action ? t(`title.${action.kind}`, { symbol: action.symbol }) : "";
  const isFloor = action?.kind === "redeem" || action?.kind === "queueToRedeem";

  return (
    <Ctx.Provider value={api}>
      {children}
      <Dialog open={phase !== "idle"} onClose={close} title={title} closeLabel={t("close")} dismissable={phase !== "sending"}>
        {phase === "preparing" ? (
          <div className="flex items-center gap-3 py-6 text-md text-ink-2">
            <Dashes />
            {t("preparing")}
          </div>
        ) : null}

        {(phase === "ready" || phase === "sending") && o ? (
          <div className="space-y-4">
            <OutcomeLines o={o} />
            <p className="text-sm text-ink-2">{ENV.mock ? t("mockNote") : t("confirmIn", { wallet })}</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="lg" onClick={close} disabled={phase === "sending"} className="flex-1">
                {t("cancel")}
              </Button>
              <Button variant={isFloor ? "floor" : "primary"} size="lg" onClick={confirm} loading={phase === "sending"} className="flex-[2]">
                {t("confirmButton", { wallet })}
              </Button>
            </div>
            {phase === "sending" ? <p className="text-xs text-ink-3">{t("waiting", { wallet })}</p> : null}
          </div>
        ) : null}

        {phase === "error" && error ? (
          <div className="space-y-4">
            <p className="text-md leading-relaxed">{te(error as Parameters<typeof te>[0])}</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="lg" onClick={close} className="flex-1">
                {t("close")}
              </Button>
              {action && error !== "rejected" ? (
                <Button variant="primary" size="lg" onClick={() => void prepare(action)} className="flex-1">
                  {t("retry")}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Dialog>
    </Ctx.Provider>
  );
}

function OutcomeLines({ o }: { o: Outcome }) {
  const t = useTranslations("tx");
  const big = "num text-2xl";
  switch (o.kind) {
    case "buy":
    case "create":
      return (
        <div className="space-y-2">
          {o.tokensOut > 0n ? (
            <p className="text-md">
              {t.rich("payReceive", {
                sol: sol(o.solIn),
                tokens: tokens(o.tokensOut),
                symbol: o.symbol,
                b: (c) => <span className="num font-medium">{c}</span>,
              })}
            </p>
          ) : (
            <p className="text-md">{t("createOnly", { symbol: o.symbol })}</p>
          )}
        </div>
      );
    case "sell": {
      const whole = o.executed + o.queued + o.dropped;
      return (
        <div className="space-y-2">
          {o.staleSettledSol > 0n ? <p className="text-sm text-ink-2">{t("staleSettled", { sol: sol(o.staleSettledSol) })}</p> : null}
          <p className={big}>
            {sol(o.solOut)} <span className="text-ink-3">SOL</span>
          </p>
          {o.queued > 0n || o.dropped > 0n ? (
            <p className="border-t-2 border-brake bg-brake/10 p-3 text-md">
              {o.queued > 0n
                ? t("brakeSplit", { exec: pct(shareOf(o.executed, whole)), sol: sol(o.solOut), queued: pct(shareOf(o.queued, whole)) })
                : t("brakeDrop", { exec: pct(shareOf(o.executed, whole)), dropped: pct(shareOf(o.dropped, whole)) })}
            </p>
          ) : (
            <p className="text-md">{t("receive", { sol: sol(o.solOut) })}</p>
          )}
        </div>
      );
    }
    case "redeem":
    case "queueToRedeem":
    case "claim":
    case "cancel":
      return (
        <div className="space-y-2">
          <p className={`${big} ${o.kind === "redeem" || o.kind === "queueToRedeem" ? "text-floor" : ""}`}>
            {sol(o.solOut)} <span className="text-ink-3">SOL</span>
          </p>
          <p className="text-md">{t("receive", { sol: sol(o.solOut) })}</p>
          {o.kind === "cancel" && o.tokensOut > 0n ? <p className="text-sm text-ink-2">{t("tokensBack", { tokens: tokens(o.tokensOut), symbol: o.symbol })}</p> : null}
          {o.feeKept > 0n ? <p className="text-sm text-ink-2">{t("redeemFee", { fee: sol(o.feeKept, 6) })}</p> : null}
        </div>
      );
  }
}
