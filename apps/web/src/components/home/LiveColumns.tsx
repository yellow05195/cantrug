"use client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo } from "react";
import { CoinCard } from "@/components/coin/CoinCard";
import type { CoinJson } from "@/lib/api/types";
import { metricsFromJson } from "@/lib/coin/metrics";
import { useLiveCoins } from "@/lib/live/patch";

interface Column {
  key: "new" | "graduating" | "floor";
  coins: CoinJson[];
}

/** New / About to graduate / Highest floor, kept live by the websocket. */
export function LiveColumns({ columns, available }: { columns: Column[]; available: boolean }) {
  const t = useTranslations("home");
  const all = useMemo(() => {
    const map = new Map<string, CoinJson>();
    for (const c of columns) for (const x of c.coins) map.set(x.mint, x);
    return [...map.values()];
  }, [columns]);
  const live = useLiveCoins(all);
  const byMint = useMemo(() => new Map(live.map((c) => [c.mint, c])), [live]);

  return (
    <div className="grid gap-x-6 gap-y-10 lg:grid-cols-3">
      {columns.map((col) => {
        const coins = col.coins.map((c) => byMint.get(c.mint) ?? c);
        if (col.key === "floor") coins.sort((a, b) => metricsFromJson(b).floorSol * Number(b.supply) - metricsFromJson(a).floorSol * Number(a.supply));
        return (
          <section key={col.key} aria-labelledby={`col-${col.key}`} className="min-w-0">
            <div className="mb-3 flex items-baseline justify-between border-b border-line pb-2">
              <h2 id={`col-${col.key}`} className="title-tight text-lg font-semibold">
                {t(`col.${col.key}`)}
              </h2>
              <Link href={`/?sort=${col.key}#coins`} className="text-sm text-ink-2 hover:text-ink">
                {t("seeAll")}
              </Link>
            </div>
            {coins.length ? (
              <ul className="flex flex-col gap-2">
                {coins.map((c) => (
                  <li key={c.mint}>
                    <CoinCard coin={c} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-sm border border-dashed border-line-2 p-4 text-sm text-ink-2">{available ? t("emptyColumn") : t("noIndexer")}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
