"use client";
import { DEFAULT_PARAMS, MAX_NAME, MAX_SYMBOL, MAX_URI, TOTAL_SUPPLY, curveBuy, curveReserves, priceQ64, q64ToSolPerToken, type Params } from "@floored/sdk";
import { ImageSquare, UploadSimple } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CoinCard } from "@/components/coin/CoinCard";
import { Button, ButtonLink, buttonClass } from "@/components/ui/Button";
import { SlabLands } from "@/components/coin/SlabLands";
import { CoinAvatar, CopyButton } from "@/components/ui/Bits";
import { Dialog } from "@/components/ui/Dialog";
import { Price } from "@/components/ui/Num";
import { ConnectPrompt } from "@/components/wallet/WalletButton";
import type { CoinJson } from "@/lib/api/types";
import { readConfig } from "@/lib/chain/reads";
import { cn } from "@/lib/cn";
import { ENV, explorerAddress } from "@/lib/env";
import { bps, parseSolInput, pct, sol, tokens } from "@/lib/format";
import { useTx } from "@/lib/tx/TxProvider";
import { hasRealUploader, uploader } from "@/lib/upload";
import { useAccount } from "@/lib/wallet/account";

const bytes = (s: string) => new TextEncoder().encode(s).length;

interface Form {
  name: string;
  symbol: string;
  description: string;
  website: string;
  x: string;
  telegram: string;
  firstBuy: string;
}

const EMPTY: Form = { name: "", symbol: "", description: "", website: "", x: "", telegram: "", firstBuy: "" };

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="text-xs text-down">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const inputCls = "h-12 w-full rounded-lg border-2 border-stroke bg-bg-3 px-3.5 text-md outline-none placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-floor aria-[invalid=true]:border-down";

export function CreateForm() {
  const t = useTranslations("create");
  const account = useAccount();
  const tx = useTx();
  const uid = useId();
  const [f, setF] = useState<Form>(EMPTY);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ mint: string; symbol: string } | null>(null);
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [createFee, setCreateFee] = useState<bigint>(20_000_000n);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ENV.mock) return;
    readConfig()
      .then((c) => {
        if (!c) return;
        setParams(c.params);
        setCreateFee(c.createFee);
      })
      .catch(() => undefined);
  }, []);

  const choose = (fl: File | null) => {
    setFile(fl);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return fl ? URL.createObjectURL(fl) : null;
    });
  };

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: k === "symbol" ? e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") : e.target.value }));

  const firstBuy = f.firstBuy.trim() ? parseSolInput(f.firstBuy) : 0n;
  const quote = useMemo(() => {
    if (!firstBuy || firstBuy <= 0n) return null;
    try {
      return curveBuy(params, { realSol: 0n, tokensSold: 0n }, firstBuy);
    } catch {
      return null;
    }
  }, [firstBuy, params]);

  const errors = {
    name: !f.name.trim() ? t("errName") : bytes(f.name) > MAX_NAME ? t("errNameLong", { max: MAX_NAME }) : null,
    symbol: !f.symbol ? t("errSymbol") : bytes(f.symbol) > MAX_SYMBOL ? t("errSymbolLong", { max: MAX_SYMBOL }) : null,
    image: !file ? t("errImage") : null,
    firstBuy: f.firstBuy.trim() && firstBuy === null ? t("errAmount") : null,
  };
  const valid = !errors.name && !errors.symbol && !errors.image && !errors.firstBuy;

  const startPrice = q64ToSolPerToken(priceQ64(curveReserves(params, { realSol: 0n, tokensSold: 0n }).sol, curveReserves(params, { realSol: 0n, tokensSold: 0n }).tok));

  const previewCoin: CoinJson = useMemo(() => {
    const sold = quote?.tokensOut ?? 0n;
    const real = quote?.solNet ?? 0n;
    const r = curveReserves(params, { realSol: real, tokensSold: sold });
    return {
      mint: "preview",
      coin: "",
      creator: account.address ?? "",
      name: f.name || t("previewName"),
      symbol: f.symbol || "TICKER",
      uri: "",
      image_url: preview,
      description: f.description,
      params: null,
      phase: "curve",
      created_slot: null,
      created_at: null,
      graduated_slot: null,
      graduated_at: null,
      real_sol: real.toString(),
      real_sol_display: 0,
      floor_reserve: (quote?.fee.pool ?? 0n).toString(),
      floor_reserve_display: 0,
      pool_sol: "0",
      pool_sol_display: 0,
      tokens_sold: sold.toString(),
      tokens_sold_display: 0,
      pool_tok: "0",
      pool_tok_display: 0,
      queued: "0",
      queued_display: 0,
      supply: TOTAL_SUPPLY.toString(),
      supply_display: 0,
      circulating: TOTAL_SUPPLY.toString(),
      circulating_display: 0,
      sol_reserves: r.sol.toString(),
      sol_reserves_display: 0,
      token_reserves: r.tok.toString(),
      token_reserves_display: 0,
      mcap_sol: "0",
      mcap_sol_display: 0,
      volume_sol: "0",
      volume_sol_display: 0,
      total_redeemed_sol: "0",
      total_redeemed_sol_display: 0,
      price: null,
      floor: null,
      floor_active: false,
      floor_preview: null,
      gap_bps: null,
      graduation_progress_bps: 0,
      holders_count: null,
      redeem_count: 0,
      buy_count: 0,
      sell_count: 0,
      brake: { engaged: false, epoch: 0, engagements: 0, drop_bps: params.brakeDropBps, window_slots: Number(params.brakeWindowSlots), window_start: null, ref_price: null, queued: "0", queued_display: 0, window: null },
      last_trade_at: null,
      last_event_slot: 0,
      updated_at: new Date(0).toISOString(),
      socials: {},
    };
  }, [f.name, f.symbol, f.description, preview, quote, params, account.address, t]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || !file) return;
    setBusy(true);
    setUploadError(null);
    try {
      const image = await uploader.uploadImage(file);
      const json = {
        name: f.name.trim(),
        symbol: f.symbol,
        description: f.description.trim(),
        image,
        extensions: { website: f.website.trim() || undefined, twitter: f.x.trim() || undefined, telegram: f.telegram.trim() || undefined },
      };
      const uri = await uploader.uploadJson(json);
      if (!ENV.mock && bytes(uri) > MAX_URI) {
        setUploadError(t("errUri", { max: MAX_URI }));
        setBusy(false);
        return;
      }
      tx.run(
        { kind: "create", name: f.name.trim(), symbol: f.symbol, uri, firstBuyLamports: firstBuy ?? 0n, slippageBps: 300 },
        {
          onDone: ({ outcome }) => {
            if (outcome.mint) setCreated({ mint: outcome.mint, symbol: f.symbol });
            setF(EMPTY);
            choose(null);
            setTouched(false);
          },
        },
      );
    } catch (err) {
      setUploadError(err instanceof Error ? t("errUpload", { reason: err.message }) : t("errUpload", { reason: "" }));
    } finally {
      setBusy(false);
    }
  };

  const err = (k: keyof typeof errors) => (touched ? errors[k] : null);
  const creatorShare = bps((params.curveFeeBps * params.curveFeeCreatorShareBps) / 10_000);

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
      <form onSubmit={submit} noValidate className="min-w-0 space-y-6 lg:col-span-7">
        <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
          <Field id={`${uid}name`} label={t("name")} error={err("name")} hint={t("nameHint", { max: MAX_NAME })}>
            <input id={`${uid}name`} className={inputCls} value={f.name} onChange={set("name")} maxLength={40} autoComplete="off" aria-invalid={Boolean(err("name"))} />
          </Field>
          <Field id={`${uid}sym`} label={t("symbol")} error={err("symbol")} hint={t("symbolHint", { max: MAX_SYMBOL })}>
            <div className="relative">
              <span className="num pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">$</span>
              <input id={`${uid}sym`} className={cn(inputCls, "num pl-6 uppercase")} value={f.symbol} onChange={set("symbol")} maxLength={10} autoComplete="off" aria-invalid={Boolean(err("symbol"))} />
            </div>
          </Field>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm text-ink-2" id={`${uid}imgl`}>
            {t("image")}
          </span>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const fl = e.dataTransfer.files?.[0];
              if (fl && fl.type.startsWith("image/")) choose(fl);
            }}
            className={cn("flex items-center gap-4 rounded-xl border-2 border-dashed p-4 transition-colors duration-150", drag ? "border-floor bg-floor-dim" : err("image") ? "border-down" : "border-stroke")}
          >
            <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border-2 border-stroke bg-bg-3">
              {preview ? (
                // Local object URL preview of the chosen file, square-cropped.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt={t("imageAlt")} className="size-full object-cover" />
              ) : (
                <ImageSquare size={28} className="text-ink-3" />
              )}
            </div>
            <div className="space-y-2">
              <p className="text-sm text-ink-2">{t("imageHint")}</p>
              <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} aria-describedby={`${uid}imgl`}>
                <UploadSimple size={14} /> {file ? t("imageReplace") : t("imageChoose")}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => {
                  const fl = e.target.files?.[0];
                  if (fl) choose(fl);
                }}
              />
              {err("image") ? <p className="text-xs text-down">{err("image")}</p> : null}
            </div>
          </div>
        </div>

        <Field id={`${uid}desc`} label={t("description")} hint={t("descriptionHint")}>
          <textarea id={`${uid}desc`} rows={3} className={cn(inputCls, "h-auto py-2.5")} value={f.description} onChange={set("description")} maxLength={500} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field id={`${uid}web`} label={t("website")}>
            <input id={`${uid}web`} className={inputCls} value={f.website} onChange={set("website")} placeholder="https://" inputMode="url" />
          </Field>
          <Field id={`${uid}x`} label="X">
            <input id={`${uid}x`} className={inputCls} value={f.x} onChange={set("x")} placeholder="https://x.com/" inputMode="url" />
          </Field>
          <Field id={`${uid}tg`} label="Telegram">
            <input id={`${uid}tg`} className={inputCls} value={f.telegram} onChange={set("telegram")} placeholder="https://t.me/" inputMode="url" />
          </Field>
        </div>

        <div className="sticker p-4">
          <Field id={`${uid}buy`} label={t("firstBuy")} error={err("firstBuy")}>
            <div className="flex items-center rounded-lg border-2 border-stroke bg-bg-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-floor">
              <input id={`${uid}buy`} className="num h-12 min-w-0 flex-1 bg-transparent px-3 text-xl outline-none placeholder:text-ink-3" inputMode="decimal" placeholder="0.00" value={f.firstBuy} onChange={set("firstBuy")} />
              <span className="num pr-3 text-ink-3">SOL</span>
            </div>
          </Field>
          <p className="mt-2 text-sm text-ink-2" aria-live="polite">
            {quote ? t("firstBuyQuote", { tokens: tokens(quote.tokensOut), pct: pct(Number((quote.tokensOut * 1_000_000n) / TOTAL_SUPPLY) / 10_000) }) : t("firstBuyHint")}
          </p>
        </div>

        <div className="space-y-3 border-t border-line pt-5">
          <p className="text-sm text-ink-2">{t("fees", { create: sol(createFee, 4), fee: bps(params.curveFeeBps), creator: creatorShare })}</p>
          {!hasRealUploader && !ENV.mock ? <p className="text-xs text-ink-3">{t("uploaderNote")}</p> : null}
          {uploadError ? <p className="text-sm text-down">{uploadError}</p> : null}
          {account.connected ? (
            <Button type="submit" variant="primary" size="lg" loading={busy || tx.busy} className="w-full sm:w-auto">
              {t("launch")}
            </Button>
          ) : (
            <ConnectPrompt label={t("connectToLaunch")} className="w-full sm:w-auto" />
          )}
        </div>
      </form>

      <aside className="min-w-0 lg:col-span-5">
        <div className="space-y-4 lg:sticky lg:top-[88px]">
          <p className="text-sm font-semibold text-ink-2">{t("previewLabel")}</p>
          {/* The building re-forms as the ticker changes, until an image is chosen. */}
          <div className="sticker flex items-center gap-5 p-5">
            <span key={preview ? "img" : f.symbol || "seed"} className="avatar-morph">
              <CoinAvatar src={preview} symbol={f.symbol || "T"} seed={f.symbol || "TICKER"} size={112} />
            </span>
            <div className="min-w-0">
              <p className="title-tight truncate text-xl font-extrabold sm:text-2xl">{f.name || t("previewName")}</p>
              <p className="num text-md text-ink-2">${f.symbol || "TICKER"}</p>
              <p className="mt-2 text-xs text-ink-3">{preview ? t("avatarImage") : t("avatarHint")}</p>
            </div>
          </div>
          <CoinCard coin={previewCoin} preview />
          <FloorFrame startPrice={startPrice} />
        </div>
      </aside>

      <Dialog open={created !== null} onClose={() => setCreated(null)} title={t("createdTitle", { symbol: created?.symbol ?? "" })} closeLabel={t("close")}>
        {created ? (
          <div className="space-y-4">
            <SlabLands floorSol={startPrice} label={t("slabLabel")} />
            <div>
              <p className="text-xs text-ink-3">{t("mint")}</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="num break-all text-sm">{created.mint}</span>
                <CopyButton value={created.mint} label={t("copy")} copiedLabel={t("copied")} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={`/coin/${created.mint}`} variant="primary">
                {t("openCoin")}
              </ButtonLink>
              <a href={`/api/og/${created.mint}`} download={`${created.symbol}-floored.png`} className={buttonClass({ variant: "secondary" })}>
                {t("shareKit")}
              </a>
              {!ENV.mock ? (
                <a href={explorerAddress(created.mint)} target="_blank" rel="noreferrer" className={buttonClass({ variant: "ghost" })}>
                  {t("explorer")}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

/** Mini chart frame: where the floor will start. Dashed, because it is not redeemable yet. */
function FloorFrame({ startPrice }: { startPrice: number }) {
  const t = useTranslations("create");
  return (
    <figure className="sticker p-4">
      <svg viewBox="0 0 320 140" className="h-auto w-full" role="img" aria-label={t("frameAria")}>
        <defs>
          <pattern id="grid" width="32" height="28" patternUnits="userSpaceOnUse">
            <path d="M32 0H0V28" fill="none" stroke="var(--line)" strokeWidth="1" opacity="0.6" />
          </pattern>
        </defs>
        <rect width="320" height="140" fill="url(#grid)" />
        <path d="M8 104 L60 98 L96 90 L140 80 L170 70 L210 58 L250 40 L300 28" fill="none" stroke="var(--ink-3)" strokeWidth="2" />
        <line x1="8" y1="96" x2="312" y2="96" stroke="var(--floor)" strokeWidth="2" strokeDasharray="6 5" />
        <text x="10" y="114" fill="var(--floor)" fontFamily="var(--font-jetbrains)" fontSize="10">
          ±0.00
        </text>
        <line x1="300" y1="20" x2="300" y2="132" stroke="var(--line-2)" strokeDasharray="2 3" />
        <text x="296" y="130" textAnchor="end" fill="var(--ink-3)" fontFamily="var(--font-jetbrains)" fontSize="10">
          {t("frameGrad")}
        </text>
      </svg>
      <figcaption className="mt-3 space-y-1">
        <p className="text-sm">{t("frameCaption")}</p>
        <p className="text-xs text-ink-3">
          {t("frameStart")} <Price value={startPrice} unit="SOL" className="text-ink-2" />
        </p>
      </figcaption>
    </figure>
  );
}
