import { getTranslations } from "next-intl/server";
import { Board, type BoardList } from "@/components/home/Board";
import { Hero } from "@/components/home/Hero";
import { Compare, Faq, FeatureCards, FinalCta, Flywheel, Specimen, Trust } from "@/components/home/HomeSections";
import { LiveTicker } from "@/components/layout/LiveTicker";
import { ButtonLink } from "@/components/ui/Button";
import { api, safely } from "@/lib/api/client";
import type { CoinJson, SortKey } from "@/lib/api/types";
import { ENV } from "@/lib/env";

export const dynamic = "force-dynamic";

const SORTS: SortKey[] = ["new", "graduating", "floor", "volume"];

/*
 * The homepage of a launchpad: the words, then the coins. Everything that
 * explains the mechanism comes after the product, in the order a newcomer
 * asks the questions.
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const sp = await searchParams;
  const sort = (SORTS.includes(sp.sort as SortKey) ? sp.sort : "new") as SortKey;
  const empty = { items: [] as CoinJson[], next_cursor: null };
  const [t, stats, fresh, graduating, floor, all] = await Promise.all([
    getTranslations("home"),
    safely(api.stats(), null),
    safely(api.coins({ sort: "new", limit: 12 }), empty),
    safely(api.coins({ sort: "graduating", phase: "curve", limit: 12 }), empty),
    safely(api.coins({ sort: "floor", phase: "graduated", limit: 12 }), empty),
    safely(api.coins({ sort, limit: 40 }), empty),
  ]);
  const seed = stats ? { lamports: stats.sol_redeemed_total, launched: stats.coins_created, brakes: stats.brake_engagements_total } : null;
  const lists: BoardList[] = [
    { key: "new", coins: fresh.items },
    { key: "graduating", coins: graduating.items },
    { key: "floor", coins: floor.items },
    { key: "all", coins: all.items },
  ];

  return (
    <>
      <Hero stats={seed} />

      {/* The product, right under the words */}
      <section id="board" className="mx-auto max-w-6xl scroll-mt-24 px-3 pt-14 md:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="kicker">{t("board.kicker")}</p>
          <ButtonLink href="/create" variant="primary" size="sm">
            {t("hero.ctaLaunch")}
          </ButtonLink>
        </div>
        <LiveTicker />
        <div className="mt-6">
          <Board lists={lists} available={api.available} demoMint={ENV.challengeMint ?? null} />
        </div>
      </section>

      <FeatureCards />
      <Flywheel />
      <Specimen />
      <Compare />
      <Trust />
      <Faq />
      <FinalCta />
    </>
  );
}
