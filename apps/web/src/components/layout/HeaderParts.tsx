"use client";
import { List, Moon, Sun, X, XLogo } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NumRoll } from "@/components/ui/NumRoll";
import { WalletButton } from "@/components/wallet/WalletButton";
import { cn } from "@/lib/cn";
import { FACE_BG, FACE_OF } from "@/lib/faces";
import { solFixed } from "@/lib/format";
import { ENV } from "@/lib/env";
import { useLiveStats } from "@/lib/live/solReturned";
import { setTheme, useIsDark } from "@/lib/theme";

export const NAV = [
  { href: "/", key: "coins" },
  { href: "/create", key: "create" },
  { href: "/portfolio", key: "portfolio" },
  { href: "/how-it-works", key: "how" },
  { href: "/stats", key: "stats" },
] as const;

export function NavLinks({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const path = usePathname();
  return (
    <nav className={className} aria-label={t("label")}>
      {NAV.map((n) => {
        const active = n.href === "/" ? path === "/" || path.startsWith("/coin/") : path.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn("items-center gap-2", onNavigate ? "flex px-3 py-3 text-lg font-medium text-ink-2 hover:text-ink aria-[current=page]:text-ink" : "relative inline-flex")}
          >
            {onNavigate ? <span aria-hidden className={cn("sticker-tile size-3.5 rounded-[4px] border border-black/10", FACE_BG[FACE_OF[n.key]])} /> : null}
            {t(n.key)}
            {/* the active page is underlined in its face colour */}
            {active && !onNavigate ? <span aria-hidden className={cn("absolute inset-x-3 bottom-3 h-[3px] rounded-full", FACE_BG[FACE_OF[n.key]])} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}


export function MiniCounter({ seed }: { seed: { lamports: string; launched: number; brakes: number } | null }) {
  const t = useTranslations("home");
  const s = useLiveStats(seed ? { lamports: BigInt(seed.lamports), launched: seed.launched, brakes: seed.brakes } : null);
  if (s.total === null) return null;
  return (
    <Link href="/stats" className="chip-mono hidden !h-10 hover:border-floor xl:inline-flex" title={t("counterLabel")}>
      <NumRoll value={solFixed(s.total, 2)} className="text-[12px] text-floor" label={`${solFixed(s.total, 2)} SOL`} />
      <span>{t("counterShort")}</span>
    </Link>
  );
}

/** Workshop lights: plaster day / night blue. */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("nav");
  const dark = useIsDark();
  return (
    <button
      type="button"
      onClick={() => setTheme(!dark)}
      className={cn("press grid size-10 place-items-center rounded-full border-2 border-seam bg-card text-ink transition-colors hover:border-floor", className)}
      aria-label={dark ? t("themeLight") : t("themeDark")}
      title={dark ? t("themeLight") : t("themeDark")}
    >
      {dark ? <Sun size={16} weight="fill" /> : <Moon size={16} weight="fill" />}
    </button>
  );
}

export function MobileMenu() {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => {
    // Close on route change.
    const id = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(id);
  }, [path]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  return (
    <div className="lg:hidden">
      <button type="button" onClick={() => setOpen(true)} className="press grid size-10 place-items-center rounded-[10px] border border-line-2 bg-card text-ink hover:border-ink-3" aria-label={t("menu")} aria-expanded={open}>
        <List size={20} />
      </button>
      {open ? (
        <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={t("menu")}>
          <button type="button" aria-label={t("closeMenu")} className="absolute inset-0 bg-black/55 motion-safe:animate-[backdrop-in_200ms_ease-out]" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-seam bg-card pb-[max(16px,env(safe-area-inset-bottom))] motion-safe:animate-[sheet-in_280ms_cubic-bezier(0.32,0.72,0,1)]">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-sm text-ink-2">{t("menu")}</span>
              <button type="button" onClick={() => setOpen(false)} className="press grid size-11 place-items-center rounded-sm text-ink-2 hover:text-ink" aria-label={t("closeMenu")}>
                <X size={18} />
              </button>
            </div>
            <NavLinks className="flex flex-col px-2 py-2 [&>a]:py-3 [&>a]:text-lg" onNavigate={() => setOpen(false)} />
            <a href={ENV.xUrl} target="_blank" rel="noreferrer" className="mx-2 flex items-center gap-2 border-t border-line px-3 py-4 text-lg font-medium text-ink-2 hover:text-ink">
              <XLogo size={16} weight="bold" />
              {t("followX")}
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function HeaderWallet() {
  return <WalletButton variant="secondary" />;
}
