import { Board, type BoardList } from "@/components/home/Board";
import { Hero } from "@/components/home/Hero";
import { LiveFace } from "@/components/home/LiveFace";
import { Cta, Faq } from "@/components/home/HomeSections";
import { Lifecycle, Problem, RulesStory } from "@/components/home/Story";
import { LiveTicker } from "@/components/layout/LiveTicker";
import { api, safely } from "@/lib/api/client";
import type { CoinJson, SortKey } from "@/lib/api/types";
import { ENV } from "@/lib/env";

export const dynamic = "force-dynamic";

const SORTS: SortKey[] = ["new", "graduating", "floor", "volume"];

/*
 * The homepage, read top to bottom: the promise and the cube, the problem
 * (red), the three rules that solve the face (white), how a coin lives
 * (blue), nine live coins (green), every coin, questions, then launch.
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const sp = await searchParams;
  const sort = (SORTS.includes(sp.sort as SortKey) ? sp.sort : "new") as SortKey;
  const empty = { items: [] as CoinJson[], next_cursor: null };
  const [fresh, graduating, floor, all] = await Promise.all([
    safely(api.coins({ sort: "new", limit: 12 }), empty),
    safely(api.coins({ sort: "graduating", phase: "curve", limit: 12 }), empty),
    safely(api.coins({ sort: "floor", phase: "graduated", limit: 12 }), empty),
    safely(api.coins({ sort, limit: 40 }), empty),
  ]);
  const lists: BoardList[] = [
    { key: "new", coins: fresh.items },
    { key: "graduating", coins: graduating.items },
    { key: "floor", coins: floor.items },
    { key: "all", coins: all.items },
  ];

  return (
    <>
      <Hero />
      <Problem />
      <RulesStory />
      <Lifecycle />
      <LiveFace coins={[...all.items, ...floor.items, ...graduating.items, ...fresh.items]} />

      <section id="board" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-20 sm:px-6 md:pt-28">
        <LiveTicker />
        <div className="mt-8">
          <Board lists={lists} available={api.available} demoMint={ENV.challengeMint ?? null} />
        </div>
      </section>

      <Faq />
      <Cta />
    </>
  );
}
