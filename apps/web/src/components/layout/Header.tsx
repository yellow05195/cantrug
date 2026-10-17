import { useTranslations } from "next-intl";
import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { ENV } from "@/lib/env";
import { HeaderWallet, MiniCounter, MobileMenu, NavLinks } from "./HeaderParts";

/** Flat header bar: one hairline under it, logo left, nav centre, numbers and wallet right. */
export function Header({ stats }: { stats: { lamports: string; launched: number; brakes: number } | null }) {
  const t = useTranslations("nav");
  return (
    <header className="capsule sticky top-0 z-40">
      <div className="mx-auto flex h-full w-full max-w-[1200px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-ink" aria-label={t("home")}>
          <LogoMark size={22} />
          FLOORED
          {ENV.isDevnet ? (
            <span className="num ml-1 border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-3" title={t("devnetHint")}>
              devnet
            </span>
          ) : null}
        </Link>
        <NavLinks className="capsule-nav hidden lg:flex" />
        <div className="ml-auto flex items-center gap-2">
          <MiniCounter seed={stats} />
          <HeaderWallet />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
