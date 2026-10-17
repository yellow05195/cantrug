"use client";
import { CaretDown, Copy, SignOut, Wallet as WalletIconGlyph } from "@phosphor-icons/react/dist/ssr";
import { WalletReadyState, type WalletName } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { cn } from "@/lib/cn";
import { ENV } from "@/lib/env";
import { shortAddress } from "@/lib/format";
import { useMounted } from "@/lib/hooks/useMounted";
import { setDemoConnected, useAccount } from "@/lib/wallet/account";

const ORDER = ["Phantom", "Solflare", "Backpack", "Mobile Wallet Adapter"];

/** Wallet picker restyled to the tokens: one list, installed wallets first, demo wallet in mock mode. */
export function WalletModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("wallet");
  const { wallets, select, connecting } = useWallet();
  const [picked, setPicked] = useState<string | null>(null);
  const sorted = [...wallets].sort((a, b) => {
    const ia = a.readyState === WalletReadyState.Installed ? 0 : 1;
    const ib = b.readyState === WalletReadyState.Installed ? 0 : 1;
    if (ia !== ib) return ia - ib;
    const oa = ORDER.indexOf(a.adapter.name);
    const ob = ORDER.indexOf(b.adapter.name);
    return (oa === -1 ? 99 : oa) - (ob === -1 ? 99 : ob);
  });
  const installed = (s: WalletReadyState) => s === WalletReadyState.Installed || s === WalletReadyState.Loadable;

  return (
    <Dialog open={open} onClose={onClose} title={t("connect")} closeLabel={t("close")}>
      <ul className="-mx-1 flex flex-col">
        {ENV.mock ? (
          <li>
            <button
              type="button"
              onClick={() => {
                setDemoConnected(true);
                onClose();
              }}
              className="press flex w-full items-center gap-3 rounded-sm px-2 py-2.5 text-left hover:bg-bg-3"
            >
              <span className="grid size-8 place-items-center rounded-sm border border-line-2 bg-bg text-floor">
                <WalletIconGlyph size={18} />
              </span>
              <span className="flex-1">
                <span className="block text-md font-medium">{t("demo")}</span>
                <span className="block text-xs text-ink-2">{t("demoHint")}</span>
              </span>
            </button>
          </li>
        ) : null}
        {sorted.map((w) => (
          <li key={w.adapter.name}>
            <button
              type="button"
              onClick={() => {
                setPicked(w.adapter.name);
                if (installed(w.readyState)) {
                  select(w.adapter.name as WalletName);
                  onClose();
                } else {
                  window.open(w.adapter.url, "_blank", "noopener,noreferrer");
                }
              }}
              className="press flex w-full items-center gap-3 rounded-sm px-2 py-2.5 text-left hover:bg-bg-3"
            >
              {/* Wallet icons are data URIs supplied by the adapters. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={w.adapter.icon} alt="" width={32} height={32} className="size-8 rounded-sm" />
              <span className="flex-1 text-md font-medium">{w.adapter.name}</span>
              <span className="text-xs text-ink-3">{connecting && picked === w.adapter.name ? t("connecting") : installed(w.readyState) ? t("detected") : t("install")}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-ink-3">{t("seekerHint")}</p>
    </Dialog>
  );
}

export function WalletButton({ className, compact }: { className?: string; compact?: boolean }) {
  const t = useTranslations("wallet");
  const mounted = useMounted();
  const account = useAccount();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  if (!mounted || !account.connected || !account.address) {
    return (
      <>
        <Button variant="primary" size="sm" className={className} onClick={() => setOpen(true)} loading={mounted && account.connecting}>
          {compact ? (
            t("connectShort")
          ) : (
            <>
              <span className="sm:hidden">{t("connectShort")}</span>
              <span className="hidden sm:inline">{t("connect")}</span>
            </>
          )}
        </Button>
        <WalletModal open={open} onClose={() => setOpen(false)} />
      </>
    );
  }

  return (
    <div className={cn("relative", className)} ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenu((v) => !v)}
        aria-expanded={menu}
        aria-haspopup="menu"
        className="press flex h-8 items-center gap-2 whitespace-nowrap rounded-sm border border-line-2 px-2.5 text-sm hover:bg-bg-3"
      >
        {account.walletIcon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={account.walletIcon} alt="" width={16} height={16} className="size-4 rounded-[1px]" />
        ) : (
          <WalletIconGlyph size={16} className="text-floor" />
        )}
        <span className="num">{shortAddress(account.address)}</span>
        <CaretDown size={12} className="hidden text-ink-3 sm:block" />
      </button>
      {menu ? (
        <div role="menu" className="float-layer absolute right-0 top-10 z-50 w-56 rounded-sm border border-line-2 bg-bg-2 p-1">
          <p className="px-2.5 py-2 text-xs text-ink-3">{account.isDemo ? t("demo") : account.walletName}</p>
          <Link role="menuitem" href="/portfolio" onClick={() => setMenu(false)} className="flex h-9 items-center rounded-sm px-2.5 text-sm hover:bg-bg-3">
            {t("portfolio")}
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(account.address!);
              setMenu(false);
            }}
            className="flex h-9 w-full items-center gap-2 rounded-sm px-2.5 text-sm hover:bg-bg-3"
          >
            <Copy size={14} /> {t("copy")}
          </button>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              account.disconnect();
              setMenu(false);
            }}
            className="flex h-9 w-full items-center gap-2 rounded-sm px-2.5 text-sm text-ink-2 hover:bg-bg-3 hover:text-ink"
          >
            <SignOut size={14} /> {t("disconnect")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Inline "Connect wallet" call to action used inside panels. */
export function ConnectPrompt({ label, className, block }: { label?: string; className?: string; block?: boolean }) {
  const t = useTranslations("wallet");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" size="lg" block={block} className={className} onClick={() => setOpen(true)}>
        {label ?? t("connect")}
      </Button>
      <WalletModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
