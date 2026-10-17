"use client";
import { useTranslations } from "next-intl";
import { NumRoll } from "@/components/ui/NumRoll";
import { solFixed } from "@/lib/format";
import { useLiveStats } from "@/lib/live/solReturned";

/** "SOL returned to holders": the giant split-flap counter. */
export function HeroCounter({ seed }: { seed: { lamports: string; launched: number; brakes: number } | null }) {
  const t = useTranslations("home");
  const s = useLiveStats(seed ? { lamports: BigInt(seed.lamports), launched: seed.launched, brakes: seed.brakes } : null);
  const value = s.total !== null ? solFixed(s.total, 2) : "0.00";
  return (
    <div>
      <p className="text-sm text-ink-2">{t("counterLabel")}</p>
      <div className="mt-2 flex items-baseline gap-3">
        <NumRoll value={value} label={`${value} SOL`} className="text-[clamp(2.75rem,9vw,4.5rem)] font-medium tracking-[-0.03em] text-floor xl:text-[5.25rem]" />
        <span className="num text-lg text-ink-3">SOL</span>
      </div>
      <dl className="mt-4 grid max-w-sm grid-cols-2 gap-x-6 border-t border-line pt-3 text-sm">
        <div>
          <dt className="text-ink-3">{t("launched")}</dt>
          <dd className="num mt-0.5 text-ink">{s.launched.toLocaleString("en-US").replace(/,/g, " ")}</dd>
        </div>
        <div>
          <dt className="text-ink-3">{t("brakes")}</dt>
          <dd className="num mt-0.5 text-ink">{s.brakes.toLocaleString("en-US").replace(/,/g, " ")}</dd>
        </div>
      </dl>
    </div>
  );
}
