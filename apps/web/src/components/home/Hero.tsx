"use client";
import { useTranslations } from "next-intl";
import { ButtonLink } from "@/components/ui/Button";
import { ENV } from "@/lib/env";
import { Cube } from "./Cube";

/*
 * Hero: the words on the left, the cube on the right. It turns a few layers,
 * rests scrambled, then comes back solved, standing on its orange face: the
 * floor it always lands on.
 */
export function Hero() {
  const t = useTranslations("home.hero");
  const tn = useTranslations("nav");

  return (
    <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-6 md:pb-24 md:pt-14">
      <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
        <div className="order-2 lg:order-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-2">
            <span className="inline-flex items-center gap-2">
              <span className="size-2 rounded-[3px] bg-cube-green ring-2 ring-cube-green/25" aria-hidden />
              {t("kicker")}
            </span>
            {ENV.mock ? (
              <span className="chip-mono !h-6 !text-xs" title={tn("mockHint")}>
                {t("demo")}
              </span>
            ) : null}
          </p>
          <h1 className="mt-5 text-[clamp(44px,6.4vw,86px)]">
            {t("a")} <span className="text-cube-orange">{t("b")}</span>
          </h1>
          <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-ink-2">{t("lede")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href="/create" variant="primary" size="lg">
              {t("ctaLaunch")}
            </ButtonLink>
            <ButtonLink href="#rules" variant="secondary" size="lg">
              {t("ctaHow")}
            </ButtonLink>
          </div>
        </div>

        <div className="relative order-1 flex justify-center lg:order-2">
          {/* the floor the cube stands on */}
          <div aria-hidden className="absolute bottom-[14%] left-1/2 h-10 w-[62%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(17,18,22,0.28),transparent)] blur-md" />
          {/* the stage is drawn at full size and scaled; out of flow so it never widens the page */}
          <div className="relative h-[230px] w-full sm:h-[290px] lg:h-[350px]">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="origin-center scale-[0.62] sm:scale-[0.8] lg:scale-100">
                <Cube size={92} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
