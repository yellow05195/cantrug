import { getTranslations } from "next-intl/server";
import { Board, type BoardList } from "@/components/home/Board";
import { CrashScene } from "@/components/home/CrashScene";
import { HeroMotion } from "@/components/home/HeroMotion";
import { Blueprint, Datum, LaunchBand } from "@/components/home/HomeSections";
import { Spotlight } from "@/components/home/Spotlight";
import { ButtonLink } from "@/components/ui/Button";
import { api, safely } from "@/lib/api/client";
import type { CoinJson, SortKey } from "@/lib/api/types";
import { ENV } from "@/lib/env";

export const dynamic = "force-dynamic";

const SORTS: SortKey[] = ["new", "graduating", "floor", "volume"];
const big = (s: string | undefined) => {
  try {
    return BigInt(s ?? "0");
  } catch {
    return 0n;
  }
};

/** Pick the spotlight and its three side chips from the coin list. */
function pickHot(coins: CoinJson[]) {
  const byVol = [...coins].sort((a, b) => {
    const va = big(a.volume_1h_sol ?? a.volume_24h_sol ?? a.volume_sol);
    const vb = big(b.volume_1h_sol ?? b.volume_24h_sol ?? b.volume_sol);
    return vb > va ? 1 : vb < va ? -1 : 0;
  });
  const king = byVol[0] ?? null;
  const rest = coins.filter((c) => c.mint !== king?.mint);
  const graduated = rest.filter((c) => c.phase === "graduated");
  const withJump = graduated.filter((c) => c.floor_change_24h_bps != null);
  const jump = withJump.length
    ? withJump.reduce((a, b) => ((b.floor_change_24h_bps ?? 0) > (a.floor_change_24h_bps ?? 0) ? b : a))
    : (graduated.reduce<CoinJson | null>((a, b) => (!a || (b.floor?.display ?? 0) > (a.floor?.display ?? 0) ? b : a), null) ?? null);
  const grad = graduated.filter((c) => c.graduated_at && c.mint !== jump?.mint).sort((a, b) => Date.parse(b.graduated_at!) - Date.parse(a.graduated_at!))[0] ?? null;
  const braked = rest.filter((c) => c.brake.engagements > 0 && c.mint !== jump?.mint && c.mint !== grad?.mint).sort((a, b) => b.brake.engagements - a.brake.engagements)[0] ?? null;
  return { king, jump, grad, braked };
}

export default async function Home({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const sp = await searchParams;
  const sort = (SORTS.includes(sp.sort as SortKey) ? sp.sort : "new") as SortKey;
  const empty = { items: [] as CoinJson[], next_cursor: null };
  const [t, stats, fresh, graduating, floor, all, pool] = await Promise.all([
    getTranslations("home"),
    safely(api.stats(), null),
    safely(api.coins({ sort: "new", limit: 12 }), empty),
    safely(api.coins({ sort: "graduating", phase: "curve", limit: 12 }), empty),
    safely(api.coins({ sort: "floor", phase: "graduated", limit: 12 }), empty),
    safely(api.coins({ sort, limit: 40 }), empty),
    safely(api.coins({ sort: "volume", limit: 50 }), empty),
  ]);
  const hot = pickHot(pool.items);
  const hotCandles = hot.king ? await safely(api.candles(hot.king.mint, "5m"), { interval: "5m" as const, unit: "", items: [] }) : null;
  const lists: BoardList[] = [
    { key: "new", coins: fresh.items },
    { key: "graduating", coins: graduating.items },
    { key: "floor", coins: floor.items },
    { key: "all", coins: all.items },
  ];
  const [l1, l2] = [t("headlineA"), t("headlineB")];

  return (
    <div className="relative">
      {/* 1. Hero: a drawing, not a photo. The headline on the left, the crash scene on the right, the datum under both. */}
      <HeroMotion className="relative isolate overflow-hidden">
        <div className="gutter relative mx-auto grid max-w-[1280px] grid-cols-1 items-end gap-x-10 gap-y-8 pb-10 pt-10 sm:pt-14 lg:grid-cols-12 lg:pt-16">
          <div className="lg:col-span-7">
            <h1 className="text-[2.5rem] font-bold leading-[1] tracking-[-0.03em] sm:text-[3.25rem] lg:text-[4rem] xl:text-[4.5rem]">
              <span data-hero-line className="block">
                {l1}
              </span>
              <span data-hero-line className="block">
                {l2}
              </span>
            </h1>
            <p data-hero-sub className="mt-6 max-w-[46ch] text-lg text-ink-2 sm:text-xl">
              {t("lede")}
            </p>
            <div data-hero-sub className="mt-7 flex flex-wrap gap-3">
              <ButtonLink href="/create" variant="primary" size="lg">
                {t("ctaLaunch")}
              </ButtonLink>
              <ButtonLink href="#coins" variant="secondary" size="lg">
                {t("ctaCoins")}
              </ButtonLink>
            </div>
          </div>
          <div className="lg:col-span-5">
            <CrashScene className="block w-full" />
          </div>
        </div>
        <Datum stats={stats} />
      </HeroMotion>

      {/* 2. Hot right now */}
      {hot.king ? (
        <section aria-labelledby="hot" className="gutter mx-auto mt-14 max-w-[1280px]">
          <div className="mb-5">
            <h2 id="hot" className="title-tight text-2xl font-bold sm:text-3xl">
              {t("hotTitle")}
            </h2>
            <p className="mt-1 text-md text-ink-2">{t("hotSub")}</p>
          </div>
          <Spotlight coin={hot.king} candles={hotCandles?.items ?? []} jump={hot.jump} grad={hot.grad} braked={hot.braked} />
        </section>
      ) : null}

      {/* 3. The board */}
      <div className="gutter mx-auto mt-16 max-w-[1280px]">
        <Board lists={lists} available={api.available} demoMint={ENV.challengeMint ?? null} />
      </div>

      {/* 4. Blueprint: how the floor works */}
      <section aria-labelledby="floor-strip" className="gutter mx-auto mt-20 max-w-[1280px]">
        <h2 id="floor-strip" className="title-tight mb-8 text-2xl font-bold sm:text-3xl">
          {t("stripTitle")}
        </h2>
        <Blueprint />
      </section>

      {/* 5. Closing band */}
      <section aria-label={t("band.title")} className="gutter mx-auto mb-4 mt-20 max-w-[1280px]">
        <LaunchBand />
      </section>
    </div>
  );
}
