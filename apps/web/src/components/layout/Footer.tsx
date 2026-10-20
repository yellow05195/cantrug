import { useTranslations } from "next-intl";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { CopyButton } from "@/components/ui/Bits";
import { ENV, explorerAddress } from "@/lib/env";

export function Footer() {
  const t = useTranslations("footer");
  const cols = [
    {
      title: t("cols.product"),
      tone: "bg-cube-green",
      links: [
        { label: t("links.coins"), href: "/" },
        { label: t("links.create"), href: "/create" },
        { label: t("links.portfolio"), href: "/portfolio" },
        { label: t("links.stats"), href: "/stats" },
      ],
    },
    {
      title: t("cols.learn"),
      tone: "bg-cube-yellow",
      links: [
        { label: t("docs"), href: "/how-it-works" },
        { label: t("verify"), href: "/how-it-works#verify" },
        { label: t("challenge"), href: "/challenge" },
        { label: t("links.fees"), href: "/how-it-works#fees" },
      ],
    },
    {
      title: t("cols.community"),
      tone: "bg-cube-blue",
      links: [
        { label: "X / Twitter", href: ENV.xUrl, external: true },
        { label: "GitHub", href: ENV.githubUrl, external: true },
        { label: t("links.program"), href: explorerAddress(ENV.programId), external: true },
      ],
    },
  ];
  return (
    <footer className="relative z-[1] mt-24 bg-cube-body text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex flex-col items-start gap-3">
          <Logo size={34} className="text-[24px] text-white" />
          <p className="max-w-[260px] text-sm leading-relaxed text-white/65">{t("tagline")}</p>
          <span aria-hidden className="mt-2 flex gap-1.5">
            {["bg-cube-white", "bg-cube-red", "bg-cube-green", "bg-cube-yellow", "bg-cube-blue", "bg-cube-orange"].map((c) => (
              <span key={c} className={`sticker-tile size-5 rounded-[5px] ${c}`} />
            ))}
          </span>
        </div>
        {cols.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h3 className="mb-3 flex items-center gap-2 font-sans text-sm font-semibold text-white/55">
              <span aria-hidden className={`sticker-tile size-2.5 rounded-[3px] ${col.tone}`} />
              {col.title}
            </h3>
            <ul className="flex flex-col gap-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  {"external" in l && l.external ? (
                    <a href={l.href} target="_blank" rel="noreferrer" className="text-sm text-white/85 hover:text-white">
                      {l.label} <span aria-hidden>↗</span>
                    </a>
                  ) : (
                    <Link href={l.href} className="text-sm text-white/85 hover:text-white">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5 font-mono text-xs text-white/50">
          <span className="flex items-center gap-2">
            <span className="uppercase tracking-wider">{t("programId")}</span>
            <a href={explorerAddress(ENV.programId)} target="_blank" rel="noreferrer" className="break-all hover:text-white">
              {ENV.programId}
            </a>
            <CopyButton value={ENV.programId} label={t("copy")} copiedLabel={t("copied")} className="shrink-0 p-1 !text-white/50 hover:!text-white" />
          </span>
          <span>{t("honesty")}</span>
        </div>
      </div>
    </footer>
  );
}
