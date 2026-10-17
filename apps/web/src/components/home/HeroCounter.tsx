"use client";
import { useTranslations } from "next-intl";
import { NumRoll } from "@/components/ui/NumRoll";
import { solFixed } from "@/lib/format";
import { useLiveStats } from "@/lib/live/solReturned";
import { heroFirstVisit } from "./HeroMotion";

/** "SOL returned to holders": the giant split-flap counter, in its own sticker. */
export function HeroCounter({ seed }: { seed: { lamports: string; launched: number; brakes: number } | null }) {
  const t = useTranslations("home");
  const s = useLiveStats(seed ? { lamports: BigInt(seed.lamports), launched: seed.launched, brakes: seed.brakes } : null);
  const value = s.total !== null ? solFixed(s.total, 2) : "0.00";
  // First visit of the session: the digits pour in from zero.
  const rollFrom = heroFirstVisit() ? value.replace(/\d/g, "0") : null;
  return (
    <div className="sticker px-5 py-4" data-hero-sub>
      <p className="text-sm font-semibold text-ink-2">{t("counterLabel")}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <NumRoll value={value} rollFrom={rollFrom} label={`${value} SOL`} className="text-[clamp(2.4rem,8vw,3.5rem)] font-medium tracking-[-0.03em] text-floor" />
        <span className="num text-md text-ink-3">SOL</span>
      </div>
      <dl className="mt-3 flex gap-6 border-t-2 border-stroke pt-3 text-sm">
        <div>
          <dt className="text-xs text-ink-3">{t("launched")}</dt>
          <dd className="num mt-0.5 text-ink">{s.launched.toLocaleString("en-US").replace(/,/g, " ")}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-3">{t("brakes")}</dt>
          <dd className="num mt-0.5 text-ink">{s.brakes.toLocaleString("en-US").replace(/,/g, " ")}</dd>
        </div>
      </dl>
    </div>
  );
}
