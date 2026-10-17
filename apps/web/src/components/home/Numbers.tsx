"use client";
import { useTranslations } from "next-intl";
import { ButtonLink } from "@/components/ui/Button";
import { NumRoll } from "@/components/ui/NumRoll";
import { solFixed } from "@/lib/format";
import { useLiveStats } from "@/lib/live/solReturned";

/** The numbers that make the case, live, in one patch card. */
export function Numbers({ stats }: { stats: { lamports: string; launched: number; brakes: number } | null }) {
  const t = useTranslations("home.numbers");
  const s = useLiveStats(stats ? { lamports: BigInt(stats.lamports), launched: stats.launched, brakes: stats.brakes } : null);
  const total = s.total !== null ? solFixed(s.total, 0) : null;
  const cells: [string, React.ReactNode, string?][] = [
    [t("returned"), total === null ? "—" : <NumRoll value={total} label={`${total} SOL`} />, "SOL"],
    [t("coins"), s.launched.toLocaleString("en-US")],
    [t("brakes"), s.brakes.toLocaleString("en-US")],
    [t("keys"), "0"],
  ];
  return (
    <section id="numbers" className="mx-auto max-w-6xl scroll-mt-24 px-3 py-20 md:px-6">
      <div className="patch-card p-6 md:p-10">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="kicker">{t("kicker")}</p>
            <h2 className="mt-3 text-[clamp(26px,3.4vw,38px)]">{t("title")}</h2>
            <p className="mt-3 max-w-[52ch] text-ink-2">{t("lede")}</p>
          </div>
          <ButtonLink href="/stats" variant="secondary" size="md">
            {t("cta")}
          </ButtonLink>
        </div>
        <dl className="mt-8 grid grid-cols-2 gap-6 border-t border-dashed border-seam pt-8 md:grid-cols-4">
          {cells.map(([k, v, unit]) => (
            <div key={k}>
              <dt className="font-mono text-[11px] uppercase tracking-wider text-ink-2">{k}</dt>
              <dd className="num mt-2 flex items-baseline gap-1 text-3xl text-ink md:text-4xl">
                {v}
                {unit ? <span className="text-sm text-ink-3">{unit}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
