import { getTranslations } from "next-intl/server";
import Image from "next/image";
import heroSlab from "../../public/assets/hero-slab.webp";
import { AllCoins } from "@/components/home/AllCoins";
import { HeroCounter } from "@/components/home/HeroCounter";
import { HeroMotion } from "@/components/home/HeroMotion";
import { HowTrio, NumbersStrip } from "@/components/home/HomeSections";
import { LiveColumns } from "@/components/home/LiveColumns";
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
    safely(api.coins({ sort: "new", limit: 6 }), empty),
    safely(api.coins({ sort: "graduating", phase: "curve", limit: 6 }), empty),
    safely(api.coins({ sort: "floor", phase: "graduated", limit: 6 }), empty),
    safely(api.coins({ sort, limit: 30 }), empty),
    safely(api.coins({ sort: "volume", limit: 50 }), empty),
  ]);
  const hot = pickHot(pool.items);
  const hotCandles = hot.king ? await safely(api.candles(hot.king.mint, "5m"), { interval: "5m" as const, unit: "", items: [] }) : null;
  const seed = stats ? { lamports: stats.sol_redeemed_total, launched: stats.coins_created, brakes: stats.brake_engagements_total } : null;

  // One view-transition name per coin per page: the first card that shows it claims it.
  const claimed = new Set<string>();
  const vtMints = new Set<string>();
  for (const [key, list] of [["new", fresh.items], ["graduating", graduating.items], ["floor", floor.items]] as const) {
    for (const c of list) {
      if (claimed.has(c.mint)) continue;
      claimed.add(c.mint);
      vtMints.add(`${key}:${c.mint}`);
    }
  }
  const allVt = all.items.filter((c) => !claimed.has(c.mint)).map((c) => c.mint);
  const [l1, l2] = [t("headlineA"), t("headlineB")];

  return (
    <div className="relative">
      {/* 1. Hero: the slab photo as a full-bleed crop, a sticker block on top. */}
      <HeroMotion className="relative isolate overflow-hidden border-b-2 border-stroke">
        <div className="absolute inset-x-0 top-0 -z-10 h-[64vw] max-h-[520px] md:inset-y-0 md:h-auto md:max-h-none">
          <Image src={heroSlab} alt={t("heroAlt")} fill priority sizes="100vw" placeholder="blur" className="object-cover object-[60%_32%]" />
          {/* The ignite veil (entrance only) and the one allowed glow, under the slab's orange line. */}
          <div data-hero-veil aria-hidden className="absolute inset-0 bg-bg opacity-0" />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(60%_80%_at_60%_100%,var(--floor-dim),transparent_70%)]" />
          <div aria-hidden className="absolute inset-0 bg-bg/30" />
        </div>
        {/* Formwork joints frame the content (home hero only). */}
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-full max-w-[1280px] -translate-x-1/2 border-x border-stroke xl:block" />
        <div className="gutter relative mx-auto grid max-w-[1280px] grid-cols-1 items-start gap-6 pb-12 pt-[46vw] md:pt-14 lg:grid-cols-12 lg:pb-16 lg:pt-16">
          <div className="sticker p-6 sm:p-8 lg:col-span-8">
            <h1 className="text-[2.6rem] font-extrabold leading-[0.98] tracking-[-0.03em] sm:text-[3.5rem] lg:text-[4.6rem] xl:text-[5.5rem]">
              <span data-hero-line className="block">
                {l1}
              </span>
              <span data-hero-line className="block">
                {l2}
              </span>
            </h1>
            <p data-hero-sub className="mt-5 max-w-[48ch] text-lg text-ink-2">
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
          <div className="lg:col-span-4 lg:justify-self-end">
            <HeroCounter seed={seed} />
          </div>
        </div>
      </HeroMotion>

      {/* 2. Hot right now */}
      {hot.king ? (
        <section aria-labelledby="hot" className="gutter mx-auto mt-14 max-w-[1280px]">
          <h2 id="hot" className="title-tight mb-5 text-2xl font-extrabold sm:text-3xl">
            {t("hotTitle")}
          </h2>
          <Spotlight coin={hot.king} candles={hotCandles?.items ?? []} jump={hot.jump} grad={hot.grad} braked={hot.braked} />
        </section>
      ) : null}

      {/* 3. Live columns */}
      <section id="coins" aria-label={t("columnsLabel")} className="gutter mx-auto mt-16 max-w-[1280px] scroll-mt-24">
        <LiveColumns
          available={api.available}
          vtMints={vtMints}
          columns={[
            { key: "new", coins: fresh.items },
            { key: "graduating", coins: graduating.items },
            { key: "floor", coins: floor.items },
          ]}
        />
      </section>

      <section aria-labelledby="all-coins" className="gutter mx-auto mt-16 max-w-[1280px]">
        <AllCoins initial={all.items} sort={sort} available={api.available} mock={ENV.mock} vtMints={allVt} />
      </section>

      {/* 4. How the floor works */}
      <section aria-labelledby="floor-strip" className="gutter mx-auto mt-20 max-w-[1280px]">
        <h2 id="floor-strip" className="title-tight mb-5 text-2xl font-extrabold sm:text-3xl">
          {t("stripTitle")}
        </h2>
        <HowTrio />
      </section>

      {/* 5. Numbers strip */}
      <section aria-label={t("numbersLabel")} className="gutter mx-auto mt-20 max-w-[1280px]">
        <NumbersStrip stats={stats} />
      </section>
    </div>
  );
}
