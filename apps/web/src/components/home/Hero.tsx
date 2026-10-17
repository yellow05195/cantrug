"use client";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { NumRoll } from "@/components/ui/NumRoll";
import { Photo } from "@/components/ui/Photo";
import { solFixed } from "@/lib/format";
import { useLiveStats } from "@/lib/live/solReturned";

/*
 * Flat hero: words left, one photograph right, the live numbers under the
 * words. No scene, no floating objects. The only colour is the second line
 * of the headline and the primary button.
 */
export function Hero({ stats }: { stats: { lamports: string; launched: number; brakes: number } | null }) {
  const t = useTranslations("home.hero");
  const s = useLiveStats(stats ? { lamports: BigInt(stats.lamports), launched: stats.launched, brakes: stats.brakes } : null);
  const total = s.total !== null ? solFixed(s.total, 0) : null;

  return (
    <section className="grid items-center gap-10 border-b border-line py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
      <div>
        <p className="kicker">{t("kicker")}</p>
        <h1 className="mt-5 text-[clamp(38px,5.2vw,68px)]">
          {t("a")}
          <br />
          <span className="text-floor">{t("b")}</span>
        </h1>
        <p className="mt-6 max-w-[52ch] text-lg text-ink-2">{t("lede")}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/create" variant="primary" size="lg">
            {t("ctaLaunch")}
          </ButtonLink>
          <ButtonLink href="/how-it-works" variant="secondary" size="lg">
            {t("ctaHow")}
          </ButtonLink>
        </div>

        <dl className="mt-12 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
          <Stat label={t("stats.returned")} value={total === null ? "—" : <NumRoll value={total} label={`${total} SOL`} />} unit="SOL" />
          <Stat label={t("stats.launched")} value={s.launched.toLocaleString("en-US")} />
          <Stat label={t("stats.brakes")} value={s.brakes.toLocaleString("en-US")} />
          <Stat label={t("stats.keys")} value="0" />
        </dl>
      </div>

      <Photo
        id="hero"
        ratio="4/5"
        priority
        sizes="(min-width: 1024px) 520px, 100vw"
        className="w-full lg:max-w-[520px] lg:justify-self-end"
        caption={
          <>
            <span>{t("captionLeft")}</span>
            <span className="num text-floor">S ÷ C</span>
          </>
        }
      />
    </section>
  );
}

function Stat({ label, value, unit }: { label: string; value: ReactNode; unit?: string }) {
  return (
    <div className="bg-bg px-4 py-4">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="num mt-1.5 flex items-baseline gap-1 text-2xl text-ink">
        {value}
        {unit ? <span className="text-xs text-ink-3">{unit}</span> : null}
      </dd>
    </div>
  );
}
