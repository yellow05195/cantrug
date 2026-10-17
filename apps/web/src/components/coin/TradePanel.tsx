"use client";
import {
  buyQuote,

  phase as phaseOf,
  redeemQuote,
  sellQuote,
  type CoinState,
} from "@floored/sdk";
import { CaretDown } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dashes } from "@/components/ui/Dashes";
import { Tabs } from "@/components/ui/Tabs";
import { ConnectPrompt } from "@/components/wallet/WalletButton";
import type { CoinChain, UserChain } from "@/lib/chain/reads";
import { cn } from "@/lib/cn";
import { bps, parseSolInput, parseTokenInput, pct, sol, tokens, tokensInput } from "@/lib/format";
import { errorKey } from "@/lib/tx/errors";
import { useTx } from "@/lib/tx/TxProvider";
import { useAccount } from "@/lib/wallet/account";

export type TradeTab = "buy" | "sell" | "redeem";

const BUY_PRESETS = ["0.1", "0.5", "1", "5"];
const FRACTIONS = [25, 50, 75, 100];

function estSlot(chain: CoinChain): bigint {
  return chain.slot + BigInt(Math.max(0, Math.floor((Date.now() - chain.readAt) / 400)));
}

export function TradePanel({
  symbol,
  mint,
  chain,
  user,
  tab,
  onTab,
  onDone,
}: {
  symbol: string;
  mint: string;
  chain: CoinChain | null;
  user: UserChain | null;
  tab: TradeTab;
  onTab: (t: TradeTab) => void;
  onDone: () => void;
}) {
  const t = useTranslations("trade");
  const te = useTranslations("errors");
  const account = useAccount();
  const tx = useTx();
  const id = useId();
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [queueRest, setQueueRest] = useState(true);
  const [showSlip, setShowSlip] = useState(false);

  const state: CoinState | null = chain?.state ?? null;
  const graduated = state ? phaseOf(state) === "graduated" : false;
  const balance = user?.balance ?? 0n;

  const switchTab = (k: TradeTab) => {
    setAmount("");
    onTab(k);
  };

  const parsed = tab === "buy" ? parseSolInput(amount) : parseTokenInput(amount);

  const quote = useMemo(() => {
    if (!state || !chain || parsed === null || parsed === 0n) return null;
    try {
      if (tab === "buy") {
        const q = buyQuote(state, parsed);
        const supply = chain.supply;
        return { kind: "buy" as const, tokensOut: q.tokensOut, fee: q.fee.total, charged: q.venue === "curve" ? q.solCharged : parsed, shareOfSupply: supply > 0n ? Number((q.tokensOut * 1_000_000n) / supply) / 10_000 : 0, completes: q.venue === "curve" && q.completes };
      }
      if (tab === "sell") {
        const q = sellQuote(state, parsed, estSlot(chain));
        return { kind: "sell" as const, executed: q.executed, braked: q.braked, solOut: q.quote?.solNet ?? 0n, fee: q.quote?.fee.total ?? 0n, execPct: Number((q.executed * 10_000n) / parsed) / 100 };
      }
      const q = redeemQuote(state, chain.supply, parsed);
      return { kind: "redeem" as const, solOut: q.solOut, gross: q.solGross, feeKept: q.feeKept };
    } catch (e) {
      return { kind: "error" as const, key: errorKey(e) };
    }
  }, [state, chain, parsed, tab]);

  const overBalance = tab !== "buy" && parsed !== null && account.connected && parsed > balance;
  const overSol = tab === "buy" && parsed !== null && account.connected && user !== null && parsed > user.lamports;

  const done = () => {
    setAmount("");
    onDone();
  };

  const submit = () => {
    if (parsed === null || parsed === 0n) return;
    if (tab === "buy") tx.run({ kind: "buy", mint, symbol, lamports: parsed, slippageBps }, { onDone: done });
    else if (tab === "sell") tx.run({ kind: "sell", mint, symbol, tokens: parsed, slippageBps, queueRemainder: queueRest }, { onDone: done });
    else tx.run({ kind: "redeem", mint, symbol, tokens: parsed }, { onDone: done });
  };

  const fees = state?.params;
  const inputLabel = tab === "buy" ? t("amountSol") : t("amountTokens", { symbol });

  return (
    <div className={cn("sticker overflow-hidden", tab === "redeem" && "border-floor-deep")}>
      <div className="p-3 pb-0">
      <Tabs
        flat
        size="lg"
        idPrefix={`trade${id}`}
        fill
        value={tab}
        onChange={switchTab}
        items={[
          { key: "buy", label: t("tabBuy") },
          { key: "sell", label: t("tabSell") },
          { key: "redeem", label: t("tabRedeem"), floor: true },
        ]}
      />
      </div>
      <div className={cn("space-y-4 p-4", tab === "redeem" && "bg-floor-dim/50")} role="tabpanel" id={`trade${id}-panel-${tab}`} aria-labelledby={`trade${id}-tab-${tab}`}>
        {tab === "redeem" && state && !graduated ? (
          <div className="space-y-2 py-2">
            <p className="text-md">{t("redeemClosed")}</p>
            <p className="text-sm text-ink-2">{t("redeemClosedHint")}</p>
          </div>
        ) : (
          <>
            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <label htmlFor={`amt${id}`} className="text-sm text-ink-2">
                  {inputLabel}
                </label>
                {account.connected && user ? (
                  <button
                    type="button"
                    className="num text-xs text-ink-3 hover:text-ink"
                    onClick={() => setAmount(tab === "buy" ? sol(user.lamports > 10_000_000n ? user.lamports - 10_000_000n : 0n, 4) : tokensInput(balance))}
                  >
                    {tab === "buy" ? t("balanceSol", { sol: sol(user.lamports) }) : t("balanceTokens", { tokens: tokens(balance), symbol })}
                  </button>
                ) : null}
              </div>
              <div className={cn("flex items-center rounded-lg border bg-bg-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-floor", overBalance || overSol ? "border-down" : "border-stroke")}>
                <input
                  id={`amt${id}`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
                  className="num h-16 min-w-0 flex-1 bg-transparent px-4 text-3xl outline-none placeholder:text-ink-3"
                  aria-invalid={overBalance || overSol || undefined}
                  aria-describedby={`q${id}`}
                />
                <span className="num pr-3 text-md text-ink-3">{tab === "buy" ? "SOL" : symbol}</span>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {tab === "buy"
                  ? BUY_PRESETS.map((p) => (
                      <button key={p} type="button" onClick={() => setAmount(p)} className="press num h-10 rounded-full border border-stroke bg-bg-3 text-sm font-medium text-ink-2 hover:border-stroke-strong hover:text-ink lg:h-9">
                        {p}
                      </button>
                    ))
                  : FRACTIONS.map((f) => (
                      <button
                        key={f}
                        type="button"
                        disabled={!account.connected || balance === 0n}
                        onClick={() => setAmount(tokensInput((balance * BigInt(f)) / 100n))}
                        className="press num h-10 rounded-full border border-stroke bg-bg-3 text-sm font-medium text-ink-2 hover:border-stroke-strong hover:text-ink disabled:opacity-40 lg:h-9"
                      >
                        {f} %
                      </button>
                    ))}
              </div>
            </div>

            <div id={`q${id}`} className="min-h-[76px] space-y-1.5 border-t border-line pt-3 text-sm" aria-live="polite">
              {!chain ? (
                <p className="flex items-center gap-2 text-ink-3">
                  <Dashes label={t("reading")} /> {t("reading")}
                </p>
              ) : !quote ? (
                <p className="text-ink-3">{tab === "buy" ? t("hintBuy") : tab === "sell" ? t("hintSell") : t("hintRedeem")}</p>
              ) : quote.kind === "error" ? (
                <p className="text-down">{te(quote.key as Parameters<typeof te>[0])}</p>
              ) : quote.kind === "buy" ? (
                <>
                  <QuoteLine label={t("youGet")} value={`≈ ${tokens(quote.tokensOut)} ${symbol}`} strong />
                  <QuoteLine label={t("shareSupply")} value={`${pct(quote.shareOfSupply)} %`} />
                  <QuoteLine label={t("fee")} value={`${sol(quote.fee, 6)} SOL`} />
                  {quote.completes ? <p className="text-xs text-ink-2">{t("completesCurve")}</p> : null}
                </>
              ) : quote.kind === "sell" ? (
                <>
                  <QuoteLine label={t("youReceive")} value={`${sol(quote.solOut)} SOL`} strong />
                  {quote.braked > 0n ? (
                    <div className="rounded-sm bg-bg-3 p-2.5 text-ink">
                      <span aria-hidden className="brake-stripes mb-2 block h-1 w-10 rounded-[1px]" />
                      {t("brakeSplit", { exec: pct(quote.execPct), rest: pct(100 - quote.execPct) })}
                      <label className="mt-1.5 flex items-center gap-2 text-xs text-ink-2">
                        <input type="checkbox" checked={queueRest} onChange={(e) => setQueueRest(e.target.checked)} className="size-3.5 accent-[var(--ink)]" />
                        {t("queueRest", { tokens: tokens(quote.braked) })}
                      </label>
                    </div>
                  ) : (
                    <QuoteLine label={t("fee")} value={`${sol(quote.fee, 6)} SOL`} />
                  )}
                </>
              ) : (
                <>
                  <QuoteLine label={t("youReceive")} value={`${sol(quote.solOut)} SOL`} strong floor />
                  <p className="text-xs text-ink-2">{t("floorShare", { gross: sol(quote.gross), fee: fees ? bps(fees.redeemFeeBps) : "0.5 %" })}</p>
                </>
              )}
              {overBalance ? <p className="text-xs text-down">{t("overBalance")}</p> : null}
              {overSol ? <p className="text-xs text-down">{t("overSol")}</p> : null}
            </div>

            {tab !== "redeem" ? (
              <div>
                <button type="button" onClick={() => setShowSlip((v) => !v)} aria-expanded={showSlip} className="flex items-center gap-1 text-xs text-ink-3 hover:text-ink-2">
                  {t("slippage", { pct: bps(slippageBps) })}
                  <CaretDown size={12} className={cn("transition-transform duration-150", showSlip && "rotate-180")} />
                </button>
                {showSlip ? (
                  <div className="mt-2 flex gap-1.5" role="group" aria-label={t("slippageLabel")}>
                    {[50, 100, 300, 500].map((b) => (
                      <button
                        key={b}
                        type="button"
                        aria-pressed={slippageBps === b}
                        onClick={() => setSlippageBps(b)}
                        className={cn("press num h-8 flex-1 rounded-full border text-xs font-medium", slippageBps === b ? "border-stroke-strong bg-surface text-ink" : "border-stroke text-ink-2 hover:text-ink")}
                      >
                        {bps(b)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {!account.connected ? (
              <ConnectPrompt block />
            ) : (
              <Button
                variant={tab === "buy" ? "primary" : tab === "sell" ? "secondary" : "floor"}
                size="lg"
                block
                disabled={!chain || parsed === null || parsed === 0n || overBalance || overSol || quote?.kind === "error" || tx.busy}
                onClick={submit}
              >
                {tab === "buy" ? t("buy") : tab === "sell" ? t("sell") : t("redeem")}
              </Button>
            )}
            {fees ? (
              <p className="text-xs text-ink-3">
                {graduated
                  ? t("feesPool", { fee: bps(fees.poolFeeBps), keep: bps((fees.poolFeeBps * fees.poolFeePoolShareBps) / 10_000) })
                  : t("feesCurve", { fee: bps(fees.curveFeeBps), creator: bps((fees.curveFeeBps * fees.curveFeeCreatorShareBps) / 10_000) })}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function QuoteLine({ label, value, strong, floor }: { label: string; value: string; strong?: boolean; floor?: boolean }) {
  return (
    <p className="flex items-baseline justify-between gap-3">
      <span className="text-ink-2">{label}</span>
      <span className={cn("num text-right", strong ? "text-md font-medium" : "text-ink-2", floor && "text-floor")}>{value}</span>
    </p>
  );
}
