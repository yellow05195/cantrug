import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import heroSlab from "../../public/assets/hero-slab.webp";
import { AllCoins } from "@/components/home/AllCoins";
import { HeroCounter } from "@/components/home/HeroCounter";
import { LiveColumns } from "@/components/home/LiveColumns";
import { ButtonLink } from "@/components/ui/Button";
import { LevelRule } from "@/components/ui/Floor";
import { api, safely } from "@/lib/api/client";
import type { SortKey } from "@/lib/api/types";
import { ENV } from "@/lib/env";

export const dynamic = "force-dynamic";

const SORTS: SortKey[] = ["new", "graduating", "floor", "volume"];

export default async function Home({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const sp = await searchParams;
  const sort = (SORTS.includes(sp.sort as SortKey) ? sp.sort : "new") as SortKey;
  const empty = { items: [], next_cursor: null };
  const [t, stats, fresh, graduating, floor, all] = await Promise.all([
    getTranslations("home"),
    safely(api.stats(), null),
    safely(api.coins({ sort: "new", limit: 6 }), empty),
    safely(api.coins({ sort: "graduating", phase: "curve", limit: 6 }), empty),
    safely(api.coins({ sort: "floor", phase: "graduated", limit: 6 }), empty),
    safely(api.coins({ sort, limit: 30 }), empty),
  ]);
  const seed = stats ? { lamports: stats.sol_redeemed_total, launched: stats.coins_created, brakes: stats.brake_engagements_total } : null;

  return (
    <div className="relative">
      {/* Formwork joints: the content container's edges, drawn as 1 px rules (home only). */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-full max-w-[1280px] -translate-x-1/2 border-x border-line/70 xl:block" />

      <section className="gutter relative mx-auto max-w-[1280px] pb-14 pt-10 md:pt-14 lg:pb-20 lg:pt-16">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-x-12 lg:gap-y-8">
          <div className="lg:col-span-7 lg:row-span-2 lg:pt-6">
            <h1 className="display-tight max-w-[15ch] text-[2.5rem] font-semibold leading-[1.04] sm:text-5xl lg:text-[4.25rem]">{t("headline")}</h1>
            <p className="mt-6 max-w-[46ch] text-lg text-ink-2">{t("lede")}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/create" variant="primary" size="lg">
                {t("ctaLaunch")}
              </ButtonLink>
              <ButtonLink href="#coins" variant="secondary" size="lg">
                {t("ctaCoins")}
              </ButtonLink>
            </div>
          </div>
          <div className="order-3 lg:order-none lg:col-span-5 lg:col-start-8 lg:row-start-1">
            <HeroCounter seed={seed} />
          </div>
          <figure className="relative order-2 aspect-[16/9] overflow-hidden rounded-sm border border-line lg:order-none lg:col-span-5 lg:col-start-8 lg:row-start-2">
            <Image src={heroSlab} alt={t("heroAlt")} fill priority sizes="(min-width: 1024px) 40vw, 100vw" placeholder="blur" className="object-cover" />
          </figure>
        </div>
      </section>

      <section id="coins" className="gutter relative mx-auto max-w-[1280px] scroll-mt-20">
        <LiveColumns
          available={api.available}
          columns={[
            { key: "new", coins: fresh.items },
            { key: "graduating", coins: graduating.items },
            { key: "floor", coins: floor.items },
          ]}
        />
      </section>

      <section aria-labelledby="floor-strip" className="gutter relative mx-auto mt-20 max-w-[1280px]">
        <LevelRule label={t("stripRule")} />
        <div className="mt-8 grid gap-8 lg:grid-cols-12">
          <h2 id="floor-strip" className="display-tight text-3xl font-semibold lg:col-span-4">
            {t("stripTitle")}
          </h2>
          <dl className="grid gap-6 sm:grid-cols-3 lg:col-span-8">
            {(["one", "two", "three"] as const).map((k) => (
              <div key={k} className="border-l border-line pl-4">
                <dt className="num text-md text-floor">{t(`facts.${k}.formula`)}</dt>
                <dd className="mt-2 text-md text-ink-2">{t(`facts.${k}.text`)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="mt-8 lg:pl-[33.4%]">
          <Link href="/how-it-works" className="text-md text-ink underline decoration-line-2 underline-offset-4 hover:decoration-ink">
            {t("stripLink")}
          </Link>
        </p>
      </section>

      <section aria-labelledby="all-coins" className="gutter relative mx-auto mt-20 max-w-[1280px]">
        <AllCoins initial={all.items} sort={sort} available={api.available} mock={ENV.mock} />
      </section>
    </div>
  );
}
