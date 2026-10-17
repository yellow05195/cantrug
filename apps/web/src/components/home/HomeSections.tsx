"use client";
import { ArrowRight, Barricade, MagnifyingGlass, Stack } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { StatsJson } from "@/lib/api/types";
import { solFixed } from "@/lib/format";
import { useLiveStats } from "@/lib/live/solReturned";

/** "How the floor works": the page's single card grid, three sticker cards. */
export function HowTrio() {
  const t = useTranslations("home");
  const cards = [
    { k: "floor", href: "/how-it-works#floor", Icon: Stack },
    { k: "brake", href: "/how-it-works#brake", Icon: Barricade },
    { k: "verify", href: "/how-it-works#verify", Icon: MagnifyingGlass },
  ] as const;
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {cards.map(({ k, href, Icon }) => (
        <li key={k}>
          <Link href={href} className="sticker lift group flex h-full flex-col gap-4 p-5">
            <span className="grid size-14 place-items-center rounded-xl border-2 border-stroke bg-bg-3 text-ink">
              <Icon size={32} weight="duotone" />
            </span>
            <span className="title-tight text-xl font-extrabold">{t(`trio.${k}.title`)}</span>
            <span className="text-md text-ink-2">{t(`trio.${k}.text`)}</span>
            <span className="num mt-auto inline-flex items-center gap-2 text-sm text-floor">
              {t(`trio.${k}.formula`)}
              <ArrowRight size={16} className="transition-transform duration-150 group-hover:translate-x-0.5" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Numbers strip: four mono figures standing on the floor-orange line. */
export function NumbersStrip({ stats }: { stats: StatsJson | null }) {
  const t = useTranslations("home");
  const s = useLiveStats(stats ? { lamports: BigInt(stats.sol_redeemed_total), launched: stats.coins_created, brakes: stats.brake_engagements_total } : null);
  if (!stats) return null;
  const items = [
    { k: t("counterLabel"), v: `${solFixed(s.total ?? 0n, 2)} SOL`, floor: true },
    { k: t("launched"), v: String(s.launched) },
    { k: t("brakes"), v: String(s.brakes) },
    { k: t("rugs"), v: String(stats.rugs_avoided) },
  ];
  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
        {items.map((it) => (
          <div key={it.k}>
            <dt className="text-sm font-semibold text-ink-2">{it.k}</dt>
            <dd className={`num mt-1 text-2xl sm:text-3xl ${it.floor ? "text-floor" : "text-ink"}`}>{it.v}</dd>
          </div>
        ))}
      </dl>
      <div aria-hidden className="mt-6 h-1.5 rounded-full bg-floor shadow-[0_3px_0_0_var(--floor-deep)]" />
    </div>
  );
}
