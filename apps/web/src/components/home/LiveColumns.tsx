"use client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CoinCard } from "@/components/coin/CoinCard";
import { Tabs } from "@/components/ui/Tabs";
import type { CoinJson } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { metricsFromJson } from "@/lib/coin/metrics";
import { useLiveCoins } from "@/lib/live/patch";

type Key = "new" | "graduating" | "floor";

interface Column {
  key: Key;
  coins: CoinJson[];
}

/**
 * New / About to graduate / Highest floor: three columns on desktop, chunky pill
 * tabs on phones. Cards stagger in (50 ms) on first paint only.
 */
export function LiveColumns({ columns, available, vtMints }: { columns: Column[]; available: boolean; vtMints: Set<string> }) {
  const t = useTranslations("home");
  const [tab, setTab] = useState<Key>("new");
  const all = useMemo(() => {
    const map = new Map<string, CoinJson>();
    for (const c of columns) for (const x of c.coins) map.set(x.mint, x);
    return [...map.values()];
  }, [columns]);
  const live = useLiveCoins(all);
  const byMint = useMemo(() => new Map(live.map((c) => [c.mint, c])), [live]);

  return (
    <div>
      <div className="mb-4 lg:hidden">
        <Tabs idPrefix="cols" fill size="md" value={tab} onChange={setTab} items={columns.map((c) => ({ key: c.key, label: t(`col.${c.key}`) }))} />
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-10 lg:grid-cols-3">
        {columns.map((col) => {
          const coins = col.coins.map((c) => byMint.get(c.mint) ?? c);
          if (col.key === "floor") coins.sort((a, b) => metricsFromJson(b).floorSol * Number(b.supply) - metricsFromJson(a).floorSol * Number(a.supply));
          return (
            <section key={col.key} aria-labelledby={`col-${col.key}`} className={cn("min-w-0", col.key !== tab && "max-lg:hidden")} role="tabpanel" id={`cols-panel-${col.key}`}>
              <div className="mb-3 hidden items-baseline justify-between lg:flex">
                <h2 id={`col-${col.key}`} className="title-tight text-xl font-extrabold">
                  {t(`col.${col.key}`)}
                </h2>
                <Link href={`/?sort=${col.key}#all-coins`} className="text-sm font-semibold text-ink-2 hover:text-ink">
                  {t("seeAll")}
                </Link>
              </div>
              {coins.length ? (
                <ul className="stagger-in flex flex-col gap-3">
                  {coins.map((c, i) => (
                    <li key={c.mint} style={{ ["--i" as string]: i }}>
                      <CoinCard coin={c} vt={vtMints.has(`${col.key}:${c.mint}`)} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border-2 border-dashed border-stroke p-4 text-sm text-ink-2">{available ? t("emptyColumn") : t("noIndexer")}</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
