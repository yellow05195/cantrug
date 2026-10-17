"use client";
import { coinPriceQ64, redeemQuote, valueAtQ64, type CoinState } from "@floored/sdk";
import { GlobeSimple, TelegramLogo, XLogo } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { ViewTransition } from "react";
import { Age, CoinAvatar, CopyButton } from "@/components/ui/Bits";
import { Flash } from "@/components/ui/Flash";
import { Chip } from "@/components/ui/Sticker";
import { vtName } from "./CoinCard";
import { CurveProgress, gapText } from "@/components/ui/Floor";
import { Num, Price } from "@/components/ui/Num";
import { NumRoll } from "@/components/ui/NumRoll";
import type { CoinJson } from "@/lib/api/types";
import type { CoinChain, UserChain } from "@/lib/chain/reads";
import type { CoinMetrics } from "@/lib/coin/metrics";
import { cn } from "@/lib/cn";
import { explorerAddress } from "@/lib/env";
import { pct, shortAddress, sol, solCompact, tiny, tokens } from "@/lib/format";

export function CoinHeader({ coin, m }: { coin: CoinJson; m: CoinMetrics }) {
  const t = useTranslations("coin");
  const tk = useTranslations("keys");
  const s = coin.socials ?? {};
  const graduated = m.phase === "graduated";
  const social = "press grid size-9 place-items-center rounded-full border-2 border-stroke bg-bg-3 text-ink-2 hover:border-stroke-strong hover:text-ink";
  return (
    <div className="sticker flex flex-wrap items-center gap-x-5 gap-y-4 p-4 sm:p-5">
      <ViewTransition name={vtName(coin.mint, "av")} share="auto" default="none">
        <CoinAvatar src={coin.image_url} symbol={coin.symbol} seed={coin.mint} size={76} />
      </ViewTransition>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <ViewTransition name={vtName(coin.mint, "nm")} share="auto" default="none">
            <h1 className="title-tight text-2xl font-extrabold leading-tight sm:text-3xl">{coin.name}</h1>
          </ViewTransition>
          <span className="num text-lg text-ink-2">${coin.symbol}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-ink-2">
          {graduated ? (
            <Chip tone="floor">
              {t("graduated")}
              {coin.graduated_at ? (
                <>
                  {" "}
                  <Age ts={coin.graduated_at} />
                </>
              ) : null}
            </Chip>
          ) : (
            <span className="flex items-center gap-2">
              <Chip>{t("toGraduation", { pct: pct(m.progress * 100) })}</Chip>
              <CurveProgress value={m.progress} className="w-20" />
            </span>
          )}
          <span>
            {t("by")}{" "}
            <a href={explorerAddress(coin.creator)} target="_blank" rel="noreferrer" className="num text-ink hover:underline">
              {shortAddress(coin.creator)}
            </a>
          </span>
          {coin.created_at ? (
            <span>
              {t("created")} <Age ts={coin.created_at} className="text-ink" />
            </span>
          ) : null}
          <span className="flex items-center gap-1.5">
            {s.website ? (
              <a href={s.website} target="_blank" rel="noreferrer nofollow" aria-label={t("website")} className={social}>
                <GlobeSimple size={16} weight="duotone" />
              </a>
            ) : null}
            {s.x ? (
              <a href={s.x} target="_blank" rel="noreferrer nofollow" aria-label="X" className={social}>
                <XLogo size={16} />
              </a>
            ) : null}
            {s.telegram ? (
              <a href={s.telegram} target="_blank" rel="noreferrer nofollow" aria-label="Telegram" className={social}>
                <TelegramLogo size={16} weight="duotone" />
              </a>
            ) : null}
          </span>
        </div>
      </div>
      {/* Live numbers roll here (and in the hero) only. */}
      <dl className="flex w-full gap-6 border-t-2 border-stroke pt-3 sm:w-auto sm:border-0 sm:pt-0 sm:text-right">
        <div>
          <dt className="text-xs font-semibold text-ink-3">{tk("price")}</dt>
          <dd className="mt-0.5 text-xl">
            <Flash value={m.priceSol}>
              <NumRoll value={tiny(m.priceSol, 4)} label={`${m.priceSol.toPrecision(4)} SOL`} />
            </Flash>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-ink-3">{graduated ? tk("floor") : tk("floorStart")}</dt>
          <dd className="mt-0.5 text-xl text-floor">
            {graduated ? <NumRoll value={tiny(m.floorSol, 4)} label={`${m.floorSol.toPrecision(4)} SOL`} /> : <Price value={m.floorPreviewSol} className="text-ink-2" />}
          </dd>
        </div>
      </dl>
    </div>
  );
}

/** "Your bag is worth at least X SOL": the exact redeem quote for the whole balance, from the chain. */
export function BagFloorBox({ chain, user, symbol, connected }: { chain: CoinChain | null; user: UserChain | null; symbol: string; connected: boolean }) {
  const t = useTranslations("bag");
  if (!connected) return null;
  const state: CoinState | null = chain?.state ?? null;
  const bal = user?.balance ?? 0n;
  let atFloor: bigint | null = null;
  let atPrice: bigint | null = null;
  if (state && chain && bal > 0n) {
    try {
      atFloor = state.phase === 1 ? redeemQuote(state, chain.supply, bal).solOut : null;
    } catch {
      atFloor = null;
    }
    atPrice = valueAtQ64(coinPriceQ64(state), bal);
  }
  const queued = user?.queue?.remaining ?? 0n;
  return (
    <div className="sticker p-4">
      {!user ? (
        <p className="text-sm text-ink-3">{t("reading")}</p>
      ) : bal === 0n && queued === 0n ? (
        <p className="text-sm text-ink-2">{t("empty", { symbol })}</p>
      ) : (
        <>
          <p className="text-sm text-ink-2">{t("label")}</p>
          {atFloor !== null ? (
            <p className="mt-1 flex items-baseline gap-2">
              <Num className="text-2xl text-floor">{sol(atFloor)}</Num>
              <span className="num text-md text-floor/80">SOL</span>
            </p>
          ) : (
            <p className="mt-1 text-md text-ink-2">{t("curve")}</p>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
            <div>
              <dt className="text-xs text-ink-3">{t("balance")}</dt>
              <dd className="num mt-0.5">
                {tokens(bal)} <span className="text-ink-3">{symbol}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">{t("market")}</dt>
              <dd className="num mt-0.5">{atPrice !== null ? `${sol(atPrice)} SOL` : "0"}</dd>
            </div>
            {queued > 0n ? (
              <div className="col-span-2">
                <dt className="text-xs text-ink-3">{t("queued")}</dt>
                <dd className="num mt-0.5">
                  {tokens(queued)} <span className="text-ink-3">{symbol}</span>
                </dd>
              </div>
            ) : null}
          </dl>
        </>
      )}
    </div>
  );
}


export function KeyNumbers({ coin, m, className }: { coin: CoinJson; m: CoinMetrics; className?: string }) {
  const t = useTranslations("keys");
  const tf = useTranslations("floor");
  const graduated = m.phase === "graduated";
  const vol24 = coin.volume_24h_sol ? BigInt(coin.volume_24h_sol) : null;
  const items: { k: string; v: React.ReactNode; floor?: boolean }[] = [
    { k: t("price"), v: <Flash value={m.priceSol}><Price value={m.priceSol} unit="SOL" /></Flash> },
    {
      k: graduated ? t("floor") : t("floorStart"),
      v: graduated ? (
        <Flash value={m.floorSol}>
          <Price value={m.floorSol} className="text-floor" />
        </Flash>
      ) : (
        <Price value={m.floorPreviewSol} className="text-ink-2" />
      ),
      floor: graduated,
    },
    { k: t("gap"), v: <span className="text-md">{graduated ? gapText(tf, m.gapPct) : tf("atGraduationShort")}</span> },
    { k: t("mcap"), v: <Num unit="SOL">{solCompact(m.mcapLamports)}</Num> },
    { k: graduated ? t("pool") : t("curveSol"), v: <Num unit="SOL">{sol(graduated ? m.poolSol : m.realSol, 2)}</Num> },
    { k: t("circulating"), v: <Num>{tokens(m.circulating)}</Num> },
    { k: t("volume24"), v: vol24 !== null ? <Num unit="SOL">{solCompact(vol24)}</Num> : <Num unit="SOL">{solCompact(BigInt(coin.volume_sol || "0"))}</Num> },
    { k: t("returned"), v: <Num unit="SOL" className="text-floor">{sol(BigInt(coin.total_redeemed_sol || "0"), 2)}</Num>, floor: true },
  ];
  return (
    <dl className={cn("sticker no-scrollbar flex gap-0.5 overflow-x-auto bg-stroke p-0 lg:grid lg:grid-cols-2 lg:overflow-hidden", className)}>
      {items.map((it) => (
        <div key={it.k} className="min-w-[44%] shrink-0 bg-surface px-3.5 py-3 xs:min-w-[36%] lg:min-w-0">
          <dt className="text-xs text-ink-3">{it.k}</dt>
          <dd className={cn("mt-1 text-md", it.floor && "text-floor")}>{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AboutCoin({ coin, chain }: { coin: CoinJson; chain: CoinChain | null }) {
  const t = useTranslations("about");
  const p = chain?.state.params;
  const rows: [string, React.ReactNode][] = [
    [t("mint"), <AddressCell key="m" a={coin.mint} />],
    [t("creator"), <AddressCell key="c" a={coin.creator} />],
  ];
  if (p) {
    rows.push(
      [t("curveFee"), <Num key="cf">{`${p.curveFeeBps / 100} %`}</Num>],
      [t("poolFee"), <Num key="pf">{`${p.poolFeeBps / 100} %`}</Num>],
      [t("redeemFee"), <Num key="rf">{`${p.redeemFeeBps / 100} %`}</Num>],
      [t("brake"), <span key="b">{t("brakeValue", { drop: p.brakeDropBps / 100, slots: Number(p.brakeWindowSlots), secs: Math.round(Number(p.brakeWindowSlots) * 0.4) })}</span>],
      [t("graduation"), <Num key="g" unit="SOL">{sol(p.graduationSol, 2)}</Num>],
    );
  }
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <p className="max-w-[60ch] text-md text-ink-2">{coin.description || t("noDescription")}</p>
      </div>
      <dl className="divide-y divide-line rounded-xl border-2 border-stroke text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 px-3 py-2">
            <dt className="text-ink-3">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function AddressCell({ a }: { a: string }) {
  const t = useTranslations("common");
  return (
    <span className="inline-flex items-center gap-1.5">
      <a href={explorerAddress(a)} target="_blank" rel="noreferrer" className="num hover:underline">
        {shortAddress(a, 5)}
      </a>
      <CopyButton value={a} label={t("copy")} copiedLabel={t("copied")} />
    </span>
  );
}
