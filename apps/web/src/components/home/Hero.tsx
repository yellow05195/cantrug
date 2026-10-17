"use client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { NumRoll } from "@/components/ui/NumRoll";
import { Scene } from "@/components/ui/Scene";
import { ENV } from "@/lib/env";
import { solFixed } from "@/lib/format";
import { useLiveStats } from "@/lib/live/solReturned";

/*
 * Hero (Plush Pons): one wide drawn scene in a rounded banner, the redeem
 * receipt standing in it, a frosted card with the words. Chips and a mono
 * status line under it.
 */
export function Hero({ stats }: { stats: { lamports: string; launched: number; brakes: number } | null }) {
  const t = useTranslations("home.hero");
  const s = useLiveStats(stats ? { lamports: BigInt(stats.lamports), launched: stats.launched, brakes: stats.brakes } : null);
  const total = s.total !== null ? solFixed(s.total, 0) : null;

  return (
    <section className="mx-auto max-w-6xl px-3 pt-5 md:px-6">
      <div className="relative overflow-hidden rounded-3xl border border-seam shadow-[0_24px_70px_-20px_var(--shadow)]">
        <Scene seed="hero" variant="site" w={220} h={84} density="busy" className="h-[520px] md:h-[540px]" />

        {/* the receipt standing on the floor */}
        <div className="pointer-events-none absolute bottom-6 left-[5%] hidden w-[300px] md:block lg:left-[7%]">
          <Receipt />
        </div>

        {/* frosted card */}
        <div className="absolute inset-x-3 bottom-3 md:inset-x-auto md:right-8 md:top-1/2 md:w-[440px] md:-translate-y-1/2">
          <div className="glass-card p-6 md:p-8">
            <h1 className="text-[clamp(28px,3.6vw,40px)] text-ink">
              {t("a")} <span className="text-floor">{t("b")}</span>
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-2">{t("lede")}</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <ButtonLink href="/create" variant="primary" size="md">
                {t("ctaLaunch")}
              </ButtonLink>
              <ButtonLink href="#board" variant="secondary" size="md">
                {t("ctaCoins")}
              </ButtonLink>
            </div>
            <Link href="/how-it-works" className="mt-4 inline-block text-sm text-ink-2 underline decoration-dashed underline-offset-4 hover:text-ink">
              {t("ctaHow")}
            </Link>
          </div>
        </div>
      </div>

      {/* chips row */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <span className="chip-mono">{t("chips.stack")}</span>
        <a className="chip-mono text-ink" href={ENV.githubUrl} target="_blank" rel="noreferrer">
          {t("chips.source")} <span aria-hidden>↗</span>
        </a>
        <Link className="chip-mono text-ink" href="/stats">
          <span className="h-1.5 w-1.5 rounded-full bg-up" aria-hidden />
          {total === null ? t("chips.loading") : <>{total} SOL {t("chips.returned")}</>} <span aria-hidden>↗</span>
        </Link>
      </div>
      <p className="mt-2 px-1 text-center font-mono text-[11px] uppercase tracking-wider text-ink-2">
        {total === null ? (
          t("status.loading")
        ) : (
          <>
            <NumRoll value={total} label={`${total} SOL`} /> SOL {t("status.returned")} · {s.launched.toLocaleString("en-US")} {t("status.coins")} · {s.brakes.toLocaleString("en-US")} {t("status.brakes")}
          </>
        )}
      </p>
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
    [t("rows.price"), "0.00 %"],
  ];
  return (
    <div className="patch-card -rotate-2 px-5 py-4 font-mono text-[12px]">
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
