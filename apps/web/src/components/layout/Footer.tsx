import { GithubLogo, XLogo } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { CopyButton } from "@/components/ui/Bits";
import { ENV, explorerAddress } from "@/lib/env";
import { LangToggle } from "./HeaderParts";

export function Footer() {
  const t = useTranslations("footer");
  return (
    <footer className="relative z-[1] mt-24 border-t border-line bg-bg-2">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <LogoMark size={24} />
              <span className="text-[15px] font-semibold tracking-tight text-ink">FLOORED</span>
            </div>
            <p className="mt-3 max-w-[40ch] text-sm text-ink-2">{t("tagline")}</p>
            <p className="mt-6 max-w-[48ch] text-xs text-ink-3">{t("honesty")}</p>
          </div>
          <nav className="flex flex-col gap-3 text-sm text-ink-2" aria-label="Footer">
            <Link href="/how-it-works" className="hover:text-ink">
              {t("docs")}
            </Link>
            <Link href="/how-it-works#verify" className="hover:text-ink">
              {t("verify")}
            </Link>
            <Link href="/challenge" className="hover:text-ink">
              {t("challenge")}
            </Link>
            <Link href="/stats" className="hover:text-ink">
              {t("stats")}
            </Link>
          </nav>
          <div className="flex flex-col gap-3 text-sm text-ink-2">
            <a href={ENV.githubUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-ink">
              <GithubLogo size={16} /> GitHub
            </a>
            <a href={ENV.xUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 hover:text-ink">
              <XLogo size={16} /> X
            </a>
            <div className="pt-2">
              <LangToggle />
            </div>
          </div>
        </div>
        <div className="mt-10 flex flex-wrap items-center gap-2 border-t border-line pt-5 text-xs text-ink-3">
          <span>{t("programId")}</span>
          <a href={explorerAddress(ENV.programId)} target="_blank" rel="noreferrer" className="num break-all text-ink-2 hover:text-ink">
            {ENV.programId}
          </a>
          <CopyButton value={ENV.programId} label={t("copy")} copiedLabel={t("copied")} className="shrink-0 p-1" />
        </div>
      </div>
    </footer>
  );
}
