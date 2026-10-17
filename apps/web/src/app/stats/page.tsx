import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { BigNumbers, ReturnedChart } from "@/components/stats/StatsParts";
import { CoinAvatar } from "@/components/ui/Bits";
import { Price } from "@/components/ui/Num";
import { api, safely } from "@/lib/api/client";
import type { CoinJson } from "@/lib/api/types";
import { metricsFromJson } from "@/lib/coin/metrics";
import { shortAddress, sol, solCompact } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("stats");
  return { title: t("title") };
}

function CoinCell({ c }: { c: { mint: string; name: string; symbol: string; image_url?: string | null } }) {
  return (
    <Link href={`/coin/${c.mint}`} className="flex items-center gap-2.5 hover:underline">
      <CoinAvatar src={c.image_url ?? null} symbol={c.symbol} size={24} />
      <span className="truncate">{c.name}</span>
      <span className="num text-xs text-ink-3">${c.symbol}</span>
    </Link>
  );
}

function Table({ title, head, rows, empty }: { title: string; head: string[]; rows: React.ReactNode[][]; empty: string }) {
  return (
    <section className="min-w-0">
      <h2 className="title-tight border-b border-line pb-2 text-lg font-extrabold">{title}</h2>
      {rows.length ? (
        <table className="mt-1 w-full text-sm">
          <thead>
            <tr className="h-8 text-left text-xs text-ink-3">
              {head.map((h, i) => (
                <th key={h} className={i ? "text-right font-normal" : "font-normal"}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="h-10 border-t border-line/60">
                {r.map((cell, j) => (
                  <td key={j} className={j ? "num text-right" : "max-w-0 truncate pr-2"}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-3 text-sm text-ink-2">{empty}</p>
      )}
    </section>
  );
}

export default async function StatsPage() {
  const t = await getTranslations("stats");
  const [stats, coins] = await Promise.all([safely(api.stats(), null), safely(api.coins({ sort: "volume", limit: 100 }), { items: [] as CoinJson[], next_cursor: null })]);
  if (!stats) {
    return (
      <div className="gutter mx-auto max-w-[1280px] pt-14">
        <h1 className="display-tight text-4xl font-extrabold">{t("title")}</h1>
        <p className="mt-4 max-w-[60ch] text-md text-ink-2">{t("noIndexer")}</p>
      </div>
    );
  }
  const graduated = coins.items.filter((c) => c.phase === "graduated").map((c) => ({ c, m: metricsFromJson(c) }));
  const byFloor = [...graduated].sort((a, b) => b.m.floorSol - a.m.floorSol).slice(0, 8);
  const braked = [...coins.items].filter((c) => c.brake.engagements > 0).sort((a, b) => b.brake.engagements - a.brake.engagements).slice(0, 8);
  const bySymbol = new Map(coins.items.map((c) => [c.mint, c]));

  return (
    <div className="gutter mx-auto max-w-[1280px] pt-10 lg:pt-14">
      <h1 className="display-tight text-4xl font-extrabold sm:text-5xl">{t("title")}</h1>
      <p className="mt-4 max-w-[60ch] text-md text-ink-2">{t("lede")}</p>
      <div className="mt-10">
        <BigNumbers stats={stats} />
      </div>
      <div className="mt-8">
        <ReturnedChart series={stats.sol_redeemed_by_day} />
      </div>
      <div className="mt-14 grid gap-10 lg:grid-cols-3">
        <Table
          title={t("topFloor")}
          head={[t("coin"), t("floor"), t("pool")]}
          empty={t("emptyTable")}
          rows={byFloor.map(({ c, m }) => [<CoinCell key="c" c={c} />, <Price key="f" value={m.floorSol} className="text-floor" />, `${solCompact(m.poolSol)}`])}
        />
        <Table
          title={t("biggestRedeem")}
          head={[t("coin"), t("wallet"), "SOL"]}
          empty={t("notServed")}
          rows={(stats.biggest_redeems ?? []).map((r) => {
            const c = bySymbol.get(r.mint);
            return [c ? <CoinCell key="c" c={c} /> : <span key="c">${r.symbol}</span>, shortAddress(r.user), <span key="s" className="text-floor">{sol(BigInt(r.sol_out), 3)}</span>];
          })}
        />
        <Table title={t("mostBraked")} head={[t("coin"), t("engagements"), t("queuedNow")]} empty={t("emptyTable")} rows={braked.map((c) => [<CoinCell key="c" c={c} />, c.brake.engagements, c.brake.engaged ? t("yes") : t("no")])} />
      </div>
    </div>
  );
}
