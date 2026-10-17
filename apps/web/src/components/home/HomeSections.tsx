"use client";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { NumRoll } from "@/components/ui/NumRoll";
import type { StatsJson } from "@/lib/api/types";
import { solFixed } from "@/lib/format";
import { useLiveStats } from "@/lib/live/solReturned";
import { BrakeDiagram, FloorDiagram, VerifyDiagram } from "@/components/how/Diagrams";
import { heroFirstVisit } from "./HeroMotion";

/** "A floor you can check": three columns separated by dimension lines, drawn diagrams, formulas in mono. */
export function Blueprint() {
  const t = useTranslations("home");
  const cols = [
    { k: "floor", href: "/how-it-works#floor", D: FloorDiagram },
    { k: "brake", href: "/how-it-works#brake", D: BrakeDiagram },
    { k: "verify", href: "/how-it-works#verify", D: VerifyDiagram },
  ] as const;
  return (
    <div className="grid grid-cols-1 gap-y-10 md:grid-cols-3 md:gap-x-0 md:divide-x md:divide-stroke">
      {cols.map(({ k, href, D }) => (
        <Link key={k} href={href} className="group block md:px-8 md:first:pl-0 md:last:pr-0" aria-label={t(`trio.${k}.title`)}>
          <D />
          <h3 className="title-tight mt-5 text-xl font-bold">{t(`trio.${k}.title`)}</h3>
          <p className="mt-2 max-w-[36ch] text-md text-ink-2">{t(`trio.${k}.text`)}</p>
          <p className="num mt-2 text-sm text-floor">{t(`trio.${k}.formula`)}</p>
          <span className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-ink group-hover:text-floor">
            {t("stripLink")}
            <ArrowRight size={16} className="transition-transform duration-150 group-hover:translate-x-0.5" />
          </span>
        </Link>
      ))}
    </div>
  );
}

/**
 * The datum: the orange floor line runs the full width of the page; the live
 * total of SOL returned to holders stands on it, with the three counts beside it.
 */
export function Datum({ stats }: { stats: StatsJson | null }) {
  const t = useTranslations("home");
  const s = useLiveStats(stats ? { lamports: BigInt(stats.sol_redeemed_total), launched: stats.coins_created, brakes: stats.brake_engagements_total } : null);
  const value = s.total !== null ? solFixed(s.total, 2) : "0.00";
  const rollFrom = heroFirstVisit() ? value.replace(/\d/g, "0") : null;
  return (
    <div className="relative">
      <div className="gutter mx-auto flex max-w-[1280px] flex-col gap-6 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink-2">{t("counterLabel")}</p>
          <div className="mt-1 flex items-baseline gap-3">
            <NumRoll value={value} rollFrom={rollFrom} label={`${value} SOL`} className="text-[clamp(2.4rem,8vw,4.25rem)] font-medium tracking-[-0.03em] text-floor" />
            <span className="num text-lg text-ink-3">SOL</span>
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-6 text-sm lg:gap-10">
          {[
            [t("launched"), s.launched],
            [t("brakes"), s.brakes],
            [t("rugs"), stats?.rugs_avoided ?? 0],
          ].map(([k, v]) => (
            <div key={String(k)}>
              <dt className="text-xs text-ink-3">{k}</dt>
              <dd className="num mt-0.5 text-xl text-ink sm:text-2xl">{Number(v).toLocaleString("en-US").replace(/,/g, " ")}</dd>
            </div>
          ))}
        </dl>
      </div>
      {/* the floor line: the one graphic element of the page */}
      <div aria-hidden className="h-0.5 w-full bg-floor" />
    </div>
  );
}

/** Closing band: one sentence, one orange button, standing on its own slab. */
export function LaunchBand() {
  const t = useTranslations("home");
  return (
    <div className="relative overflow-hidden rounded-xl border border-stroke bg-bg-2">
      <div className="relative grid gap-6 p-6 sm:p-10 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-8">
          <h2 className="title-tight text-3xl font-bold sm:text-4xl">{t("band.title")}</h2>
          <p className="mt-3 max-w-[52ch] text-lg text-ink-2">{t("band.text")}</p>
        </div>
        <div className="flex flex-wrap gap-3 lg:col-span-4 lg:justify-end">
          <ButtonLink href="/create" variant="primary" size="lg">
            {t("ctaLaunch")}
          </ButtonLink>
          <ButtonLink href="/how-it-works" variant="secondary" size="lg">
            {t("band.how")}
          </ButtonLink>
        </div>
      </div>
      <div aria-hidden className="h-0.5 w-full bg-floor" />
    </div>
  );
}
