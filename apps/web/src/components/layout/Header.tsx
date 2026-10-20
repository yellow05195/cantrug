import { useTranslations } from "next-intl";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { ENV } from "@/lib/env";
import { HeaderWallet, MobileMenu, NavLinks } from "./HeaderParts";

/** Full-width bar in the cube's black: logo, the nav (each page a coloured sticker), the action and the wallet. */
export function Header({ stats: _stats }: { stats: { lamports: string; launched: number; brakes: number } | null }) {
  const t = useTranslations("nav");
  return (
    <header className="sticky top-0 z-40 bg-cube-body text-white">
      <div className="capsule mx-auto w-full max-w-6xl px-4 sm:px-6">
        <Link href="/" className="flex flex-none items-center gap-2 text-[17px]" aria-label={t("home")}>
          <Logo size={28} className="text-white" />
          {ENV.isDevnet ? (
            <span className="ml-1 hidden rounded-[6px] border border-white/20 px-2 py-0.5 text-[11px] font-medium text-white/60 sm:inline" title={t("devnetHint")}>
              devnet
            </span>
          ) : null}
        </Link>
        <NavLinks className="capsule-nav hidden lg:flex" />
        <div className="ml-auto flex flex-none items-center gap-2">
          <span className="hidden lg:inline-flex">
            <ButtonLink href="/create" variant="primary" size="sm">
              {t("launch")}
            </ButtonLink>
          </span>
          <HeaderWallet />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
