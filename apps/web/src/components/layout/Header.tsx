import { useTranslations } from "next-intl";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { ENV } from "@/lib/env";
import { HeaderWallet, LangToggle, MiniCounter, MobileMenu, NavLinks, ThemeToggle } from "./HeaderParts";

export function Header({ theme, stats }: { theme: "dark" | "light"; stats: { lamports: string; launched: number; brakes: number } | null }) {
  const t = useTranslations("nav");
  return (
    <header className="sticky top-0 z-40 h-16 border-b-2 border-stroke bg-bg shadow-[0_3px_0_0_var(--shadow)]">
      <div className="gutter mx-auto flex h-full max-w-[1440px] items-center gap-3">
        <Link href="/" className="press -ml-1 flex items-center gap-2 rounded-sm px-1 py-1" aria-label={t("home")}>
          <Logo />
        </Link>
        {ENV.isDevnet ? (
          <span className="num rounded-full border-2 border-stroke bg-bg-3 px-2 py-0.5 text-xs text-ink-2" title={t("devnetHint")}>
            devnet
          </span>
        ) : null}
        {ENV.mock ? (
          <span className="hidden whitespace-nowrap rounded-full border-2 border-dashed border-stroke px-2 py-0.5 text-xs text-ink-3 xl:inline" title={t("mockHint")}>
            {t("mock")}
          </span>
        ) : null}
        <NavLinks className="ml-2 hidden items-center whitespace-nowrap lg:flex xl:ml-4" />
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <MiniCounter seed={stats} />
          <LangToggle className="hidden lg:flex" />
          <ThemeToggle initial={theme} className="hidden lg:grid" />
          <HeaderWallet />
          <MobileMenu theme={theme} />
        </div>
      </div>
    </header>
  );
}
