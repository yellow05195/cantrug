import { useTranslations } from "next-intl";
import Link from "next/link";
import { LogoMark } from "@/components/brand/Logo";
import { CopyButton } from "@/components/ui/Bits";
import { Scene } from "@/components/ui/Scene";
import { ENV, explorerAddress } from "@/lib/env";
import { LangToggle } from "./HeaderParts";

export function Footer() {
  const t = useTranslations("footer");
  const cols = [
    {
      title: t("cols.product"),
      links: [
        { label: t("links.coins"), href: "/" },
        { label: t("links.create"), href: "/create" },
        { label: t("links.portfolio"), href: "/portfolio" },
        { label: t("links.stats"), href: "/stats" },
      ],
    },
    {
      title: t("cols.learn"),
      links: [
        { label: t("docs"), href: "/how-it-works" },
        { label: t("verify"), href: "/how-it-works#verify" },
        { label: t("challenge"), href: "/challenge" },
        { label: t("links.fees"), href: "/how-it-works#fees" },
      ],
    },
    {
      title: t("cols.community"),
      links: [
        { label: "X / Twitter", href: ENV.xUrl, external: true },
        { label: "GitHub", href: ENV.githubUrl, external: true },
        { label: t("links.program"), href: explorerAddress(ENV.programId), external: true },
      ],
    },
  ];
  return (
    <footer className="relative z-[1] mt-24 border-t border-seam bg-bg-2">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex flex-col items-start gap-3">
          <div className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <LogoMark size={28} /> FLOORED
          </div>
          <p className="max-w-[260px] text-sm leading-relaxed text-ink-2">{t("tagline")}</p>
          <div className="mt-1 h-24 w-48 overflow-hidden rounded-xl border border-seam">
            <Scene seed="footer" variant="city" w={96} h={40} className="h-full" />
          </div>
          <LangToggle />
        </div>
        {cols.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h3 className="mb-3 font-mono text-xs font-medium uppercase tracking-widest text-ink-2">{col.title}</h3>
            <ul className="flex flex-col gap-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  {"external" in l && l.external ? (
                    <a href={l.href} target="_blank" rel="noreferrer" className="text-sm text-ink hover:text-floor">
                      {l.label} <span aria-hidden>↗</span>
                    </a>
                  ) : (
                    <Link href={l.href} className="text-sm text-ink hover:text-floor">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-seam">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5 font-mono text-xs text-ink-2">
          <span className="flex items-center gap-2">
            <span className="uppercase tracking-wider">{t("programId")}</span>
            <a href={explorerAddress(ENV.programId)} target="_blank" rel="noreferrer" className="break-all hover:text-ink">
              {ENV.programId}
            </a>
            <CopyButton value={ENV.programId} label={t("copy")} copiedLabel={t("copied")} className="shrink-0 p-1" />
          </span>
          <span>{t("honesty")}</span>
        </div>
      </div>
    </footer>
  );
}
