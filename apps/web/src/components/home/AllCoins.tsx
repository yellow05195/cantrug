"use client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { CoinCard } from "@/components/coin/CoinCard";
import type { CoinJson, SortKey } from "@/lib/api/types";
import { cn } from "@/lib/cn";
import { ENV } from "@/lib/env";
import { useLiveCoins } from "@/lib/live/patch";

const SORTS: SortKey[] = ["new", "graduating", "floor", "volume"];

export function AllCoins({ initial, sort, available, mock, vtMints = [] }: { initial: CoinJson[]; sort: SortKey; available: boolean; mock: boolean; vtMints?: string[] }) {
  const t = useTranslations("home");
  const coins = useLiveCoins(initial);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="all-coins" className="title-tight scroll-mt-24 text-2xl font-extrabold sm:text-3xl">
          {t("allCoins")}
        </h2>
        <nav className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-full border-2 border-stroke bg-bg-2 p-1" aria-label={t("sortLabel")}>
          {SORTS.map((s) => (
            <Link
              key={s}
              href={`/?sort=${s}#all-coins`}
              scroll={false}
              aria-current={s === sort ? "true" : undefined}
              className={cn(
                "whitespace-nowrap rounded-full border-2 px-4 py-1.5 text-sm font-semibold transition-[background-color,border-color,color] duration-150",
                s === sort ? "border-stroke-strong bg-surface text-ink shadow-[0_2px_0_0_var(--shadow)]" : "border-transparent text-ink-2 hover:text-ink",
              )}
            >
              {t(`sort.${s}`)}
            </Link>
          ))}
        </nav>
      </div>
      {coins.length ? (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {coins.map((c) => (
            <li key={c.mint}>
              <CoinCard coin={c} vt={vtMints.includes(c.mint)} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 rounded-xl border-2 border-dashed border-stroke p-6">
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
