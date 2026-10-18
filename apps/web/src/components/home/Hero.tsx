"use client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Scene } from "@/components/ui/Scene";
import { solFixed } from "@/lib/format";
import { useLiveStats } from "@/lib/live/solReturned";

/*
 * Hero: the words on the left, the construction site on the right with the
 * redeem receipt standing on its floor.
 * Orange is the action. Lines rise once on load.
 */
export function Hero({ stats }: { stats: { lamports: string; launched: number; brakes: number } | null }) {
  const t = useTranslations("home.hero");
  const s = useLiveStats(stats ? { lamports: BigInt(stats.lamports), launched: stats.launched, brakes: stats.brakes } : null);
  const total = s.total !== null ? solFixed(s.total, 0) : null;
  const rise = (i: number) => ({ className: "rise", style: { ["--rise-delay" as string]: `${70 * i}ms` } });

  return (
    <section className="mx-auto max-w-6xl px-3 pt-10 md:px-6 md:pt-16">
      <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
        <div>
          <h1 className="text-[clamp(40px,5.6vw,68px)] leading-[1.02]">
            <span {...rise(1)} className="rise block">
              {t("a")}
            </span>
            <span {...rise(2)} className="rise block text-floor">
              {t("b")}
            </span>
          </h1>
          <p {...rise(3)} className="rise mt-6 max-w-[52ch] text-base leading-relaxed text-ink-2 sm:text-lg">
            {t("lede")}
          </p>
          <div {...rise(4)} className="rise mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href="/create" variant="primary" size="lg">
              {t("ctaLaunch")}
            </ButtonLink>
            <ButtonLink href="#coins" variant="secondary" size="lg">
              {t("ctaCoins")}
            </ButtonLink>
          </div>
          <div {...rise(5)} className="rise mt-6 flex flex-wrap items-center gap-2">
            <Link className="chip-mono text-ink" href="/stats">
              <span className="h-1.5 w-1.5 rounded-full bg-up" aria-hidden />
              {total === null ? t("chips.loading") : <>{total} SOL {t("chips.returned")}</>}
            </Link>
            <span className="chip-mono">
              {s.launched.toLocaleString("en-US")} {t("status.coins")}
            </span>
          </div>
        </div>

        {/* the site, standing on the right */}
        <div {...rise(2)} className="rise relative">
          <div className="relative overflow-hidden rounded-3xl border border-seam shadow-[0_24px_70px_-20px_var(--shadow)]">
            <Scene seed="hero" variant="site" w={150} h={120} density="busy" className="h-[360px] sm:h-[440px] lg:h-[520px]" />
            <div className="absolute inset-x-4 bottom-4 sm:inset-x-auto sm:right-6 sm:w-[270px]">
              <Receipt />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The redeem receipt: the one object that lives in the scene. */
function Receipt() {
  const t = useTranslations("home.receipt");
  const rows: [string, string, boolean?][] = [
    [t("rows.tokens"), "50 000 000 FLR"],
    [t("rows.pool"), "85.00 SOL"],
    [t("rows.share"), "5.3587 SOL"],
    [t("rows.fee"), "− 0.0268 SOL"],
    [t("rows.paid"), "5.3319 SOL", true],
  ];
  return (
    <div className="patch-card -rotate-1 px-5 py-4 font-mono text-[12px]">
      <div className="flex items-baseline justify-between pb-3">
        <b className="font-display text-sm font-semibold text-ink">{t("title")}</b>
        <span className="text-ink-3">{t("subtitle")}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 border-t border-dashed border-seam pt-3">
        {rows.map(([k, v, big]) => (
          <div key={k} className="contents">
            <dt className="text-ink-3">{k}</dt>
            <dd className={`num whitespace-nowrap text-right ${big ? "text-lg font-bold text-floor" : "text-ink"}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex items-center justify-between border-t border-dashed border-seam pt-3 text-[10px] uppercase tracking-wider text-ink-3">
        <span>{t("footer")}</span>
        <span className="inline-block -rotate-6 rounded-md border-2 border-up px-1.5 py-0.5 font-display text-[10px] font-bold tracking-widest text-up">{t("stamp")}</span>
      </div>
    </div>
  );
}
