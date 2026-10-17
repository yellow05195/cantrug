import { Board, type BoardList } from "@/components/home/Board";
import { Hero } from "@/components/home/Hero";
import { FeatureCards, FinalCta } from "@/components/home/HomeSections";
import { Numbers } from "@/components/home/Numbers";
import { LiveTicker } from "@/components/layout/LiveTicker";
import { api, safely } from "@/lib/api/client";
import type { CoinJson, SortKey } from "@/lib/api/types";
import { ENV } from "@/lib/env";

export const dynamic = "force-dynamic";

const SORTS: SortKey[] = ["new", "graduating", "floor", "volume"];

/*
 * The homepage of a launchpad is short: the words, the coins, the three
 * guarantees, the numbers, one closing call. Everything that explains the
 * mechanism in depth lives on How it works.
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const sp = await searchParams;
  const sort = (SORTS.includes(sp.sort as SortKey) ? sp.sort : "new") as SortKey;
  const empty = { items: [] as CoinJson[], next_cursor: null };
  const [stats, fresh, graduating, floor, all] = await Promise.all([
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

      <section id="board" className="mx-auto max-w-6xl scroll-mt-24 px-3 py-20 md:px-6">
        <LiveTicker />
        <div className="mt-8">
          <Board lists={lists} available={api.available} demoMint={ENV.challengeMint ?? null} />
        </div>
      </section>

      <FeatureCards />
      <Numbers stats={seed} />
      <FinalCta />
    </>
  );
}
