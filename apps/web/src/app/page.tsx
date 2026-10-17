import { getTranslations } from "next-intl/server";
import { Board, type BoardList } from "@/components/home/Board";
import { Hero } from "@/components/home/Hero";
import { Compare, Faq, Launch, Math, Section, Steps, Trust } from "@/components/home/HomeSections";
import { LiveTicker } from "@/components/layout/LiveTicker";
import { Reveal } from "@/components/layout/Reveal";
import { api, safely } from "@/lib/api/client";
import type { CoinJson, SortKey } from "@/lib/api/types";
import { ENV } from "@/lib/env";

export const dynamic = "force-dynamic";

const SORTS: SortKey[] = ["new", "graduating", "floor", "volume"];

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
    <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">
      <Hero stats={seed} />

      <Section id="how" title={t("steps.title")} lede={t("steps.lede")}>
        <Steps />
      </Section>

      <Section id="compare" title={t("compare.title")} lede={t("compare.lede")}>
        <Compare />
      </Section>

      <Section id="math" title={t("math.title")}>
        <Math />
      </Section>

      {/* The board: the product, full width */}
      <section id="board" className="scroll-mt-20 border-b border-line py-16 sm:py-20">
        <Reveal>
          <p className="kicker">{t("board.kicker")}</p>
          <div className="mt-4">
            <LiveTicker />
          </div>
          <div className="mt-6">
            <Board lists={lists} available={api.available} demoMint={ENV.challengeMint ?? null} />
          </div>
        </Reveal>
      </section>

      <Section id="trust" title={t("trust.title")} lede={t("trust.lede")}>
        <Trust />
      </Section>

      <Section id="faq" title={t("faq.title")}>
        <Faq />
      </Section>

      <section id="launch" className="py-16 sm:py-20">
        <Reveal>
          <Launch />
        </Reveal>
      </section>
    </div>
  );
}
