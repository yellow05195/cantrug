import { useTranslations } from "next-intl";
import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { ENV } from "@/lib/env";
import { HeaderWallet, MiniCounter, MobileMenu, NavLinks, ThemeToggle } from "./HeaderParts";

/** Pill header (Plush Pons): logo left, nav centred, lights, wallet and menu right. */
export function Header({ stats }: { stats: { lamports: string; launched: number; brakes: number } | null }) {
  const t = useTranslations("nav");
  return (
    <header className="pointer-events-none sticky top-3 z-40 mt-3 px-3 sm:px-4">
      <div className="capsule pointer-events-auto mx-auto w-full max-w-6xl">
        <Link href="/" className="flex flex-none items-center gap-2 font-display text-[17px] font-semibold tracking-tight text-ink" aria-label={t("home")}>
          <LogoMark size={26} />
          FLOORED
          {ENV.isDevnet ? (
            <span className="num ml-1 hidden rounded-full border border-seam px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-2 sm:inline" title={t("devnetHint")}>
              devnet
            </span>
          ) : null}
        </Link>
        <NavLinks className="capsule-nav absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 lg:flex" />
        <div className="ml-auto flex flex-none items-center gap-1.5">
          <MiniCounter seed={stats} />
          <ThemeToggle />
          <HeaderWallet />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
