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
    <footer className="mt-24 border-t border-line">
      <div className="gutter mx-auto grid max-w-[1280px] gap-8 py-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-ink-2">
            <LogoMark size={20} />
            <span className="text-sm">{t("tagline")}</span>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-ink-3">{t("programId")}</p>
            <div className="flex items-center gap-2">
              <a href={explorerAddress(ENV.programId)} target="_blank" rel="noreferrer" className="num break-all text-sm text-ink-2 hover:text-ink">
                {ENV.programId}
              </a>
              <CopyButton value={ENV.programId} label={t("copy")} copiedLabel={t("copied")} className="shrink-0 p-1" />
            </div>
          </div>
        </div>
        <ul className="space-y-2 text-sm">
          <li>
            <Link href="/how-it-works#verify" className="text-ink hover:underline hover:underline-offset-4">
              {t("verify")}
            </Link>
          </li>
          <li>
            <Link href="/challenge" className="text-ink-2 hover:text-ink">
              {t("challenge")}
            </Link>
          </li>
          <li>
            <Link href="/how-it-works" className="text-ink-2 hover:text-ink">
              {t("docs")}
            </Link>
          </li>
          <li>
            <Link href="/stats" className="text-ink-2 hover:text-ink">
              {t("stats")}
            </Link>
          </li>
        </ul>
        <div className="flex flex-col gap-4 md:items-end">
          <div className="flex items-center gap-1">
            <a href={ENV.xUrl} target="_blank" rel="noreferrer" aria-label="X" className="press grid size-9 place-items-center rounded-sm text-ink-2 hover:bg-bg-3 hover:text-ink">
              <XLogo size={18} />
            </a>
            <a href={ENV.githubUrl} target="_blank" rel="noreferrer" aria-label="GitHub" className="press grid size-9 place-items-center rounded-sm text-ink-2 hover:bg-bg-3 hover:text-ink">
              <GithubLogo size={18} />
            </a>
          </div>
          <LangToggle />
          <p className="max-w-[34ch] text-xs text-ink-3 md:text-right">{t("honesty")}</p>
        </div>
      </div>
    </footer>
  );
}
