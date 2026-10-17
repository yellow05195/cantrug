"use client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { CoinCard } from "@/components/coin/CoinCard";
import type { CoinJson, SortKey } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { ENV } from "@/lib/env";
import { useLiveCoins } from "@/lib/live/patch";

const SORTS: SortKey[] = ["new", "graduating", "floor", "volume"];

export function AllCoins({ initial, sort, available, mock }: { initial: CoinJson[]; sort: SortKey; available: boolean; mock: boolean }) {
  const t = useTranslations("home");
  const coins = useLiveCoins(initial);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line">
        <h2 id="all-coins" className="title-tight pb-3 text-xl font-semibold">
          {t("allCoins")}
        </h2>
        <nav className="no-scrollbar -mb-px flex overflow-x-auto" aria-label={t("sortLabel")}>
          {SORTS.map((s) => (
            <Link
              key={s}
              href={`/?sort=${s}#all-coins`}
              scroll={false}
              aria-current={s === sort ? "true" : undefined}
              className={cn("whitespace-nowrap border-b-2 px-3 pb-3 text-md", s === sort ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink")}
            >
              {t(`sort.${s}`)}
            </Link>
          ))}
        </nav>
      </div>
      {coins.length ? (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {coins.map((c) => (
            <li key={c.mint}>
              <CoinCard coin={c} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 rounded-sm border border-dashed border-line-2 p-6">
          <p className="text-md text-ink-2">{available ? t("emptyAll") : t("noIndexer")}</p>
          {!available && !mock ? (
            <Link href={`/coin/${ENV.challengeMint}`} className="mt-2 inline-block text-md text-ink underline underline-offset-4">
              {t("openDemo")}
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}
