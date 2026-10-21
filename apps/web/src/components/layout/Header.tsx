import { XLogo } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { ButtonLink } from "@/components/ui/Button";
import { ENV } from "@/lib/env";
import { HeaderWallet, MobileMenu, NavLinks } from "./HeaderParts";

/** Light bar on the page ground with a hairline under it: logo and X, the nav (the active page underlined in its face colour), the action and the wallet. */
export function Header({ stats: _stats }: { stats: { lamports: string; launched: number; brakes: number } | null }) {
  const t = useTranslations("nav");
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg text-ink">
      <div className="capsule mx-auto w-full max-w-6xl px-4 sm:px-6">
        <Link href="/" className="flex flex-none items-center gap-2 text-[17px]" aria-label={t("home")}>
          <Logo size={28} className="text-ink" />
          {ENV.isDevnet ? (
            <span className="ml-1 hidden rounded-[6px] border border-line-2 px-2 py-0.5 text-[11px] font-medium text-ink-3 sm:inline" title={t("devnetHint")}>
              devnet
            </span>
          ) : null}
        </Link>
        {/* X sits right after the name */}
        <a
          href={ENV.xUrl}
          target="_blank"
          rel="noreferrer"
          className="press -ml-1 grid size-8 flex-none place-items-center rounded-[8px] border border-line-2 bg-card text-ink hover:border-ink-3"
          aria-label={t("followX")}
          title={t("followX")}
        >
          <XLogo size={15} weight="bold" />
        </a>
        <NavLinks className="capsule-nav hidden self-stretch lg:flex" />
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
