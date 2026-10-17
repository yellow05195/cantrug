import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { pct } from "@/lib/format";
import { Price } from "./Num";

/** `±0.00` chip: orange floor value on floor-dim, or the curve-phase note. */
export function FloorBadge({ floorSol, active, size = "sm", className, short }: { floorSol: number; active: boolean; size?: "sm" | "md"; className?: string; short?: boolean }) {
  const t = useTranslations("floor");
  if (!active) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-dashed border-stroke px-2.5 py-0.5 text-xs font-medium text-ink-2", className)}>
        <span className="num text-ink-3">±0.00</span>
        {short ? t("atGraduationCard") : t("atGraduation")}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-floor/45 bg-floor-dim px-2.5 py-0.5 font-medium text-floor", size === "md" ? "text-md" : "text-xs", className)}>
      <span className="num opacity-70">±0.00</span>
      <Price value={floorSol} />
    </span>
  );
}

/**
 * Price vs floor on one rule. The orange segment is the part of the price the
 * pool guarantees; the ink tick is the price. Text: "34 % above the floor".
 */
export function GapMeter({ gapPct, guaranteedShare, className, compact }: { gapPct: number | null; guaranteedShare: number; className?: string; compact?: boolean }) {
  const t = useTranslations("floor");
  const share = Math.max(0, Math.min(1, guaranteedShare));
  return (
    <div className={cn("w-full", className)}>
      <div className="relative h-2" aria-hidden>
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-bg-3" />
        {gapPct !== null ? (
          <>
            <div className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-floor" style={{ width: `${share * 100}%` }} />
            <div className="absolute top-0 h-2 w-0.5 rounded-full bg-floor" style={{ left: `calc(${share * 100}% - 1px)` }} />
          </>
        ) : null}
        <div className="absolute right-0 top-0 h-2 w-0.5 rounded-full bg-ink" />
      </div>
      {compact ? null : <p className="mt-1 text-xs text-ink-2">{gapText(t, gapPct)}</p>}
    </div>
  );
}

type T = ReturnType<typeof useTranslations<"floor">>;
export function gapText(t: T, gapPct: number | null): string {
  if (gapPct === null) return t("noFloorYet");
  if (Math.abs(gapPct) < 0.05) return t("atFloor");
  return gapPct > 0 ? t("above", { pct: pct(gapPct) }) : t("below", { pct: pct(-gapPct) });
}

/** Section rule with a level mark. Use at most twice per page. */
export function LevelRule({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 text-xs text-ink-3", className)} role="separator">
      <span className="num">±0.00</span>
      <span className="h-px flex-1 bg-line" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}

/** Curve progress: thin ink bar, never orange (the floor does not exist yet). */
export function CurveProgress({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-bg-3", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <div className="absolute inset-y-0 left-0 rounded-full bg-ink" style={{ width: `${v * 100}%` }} />
    </div>
  );
}
