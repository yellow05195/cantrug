"use client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/layout/Reveal";
import { cn } from "@/lib/cn";

/*
 * The homepage story, in the order a newcomer needs it: what goes wrong in
 * the trenches (a red band), the three rules that fix it (a face that solves
 * itself as you scroll), how a coin lives (a blue band).
 */

/** The problem: one red band, two things that always happen, the answer. */
export function Problem() {
  const t = useTranslations("home.problem");
  const items = ["dump", "dead"] as const;
  return (
    <section className="bg-cube-red text-white">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <Reveal>
          <p className="text-sm font-semibold text-white/80">{t("kicker")}</p>
          <h2 className="mt-3 max-w-[16ch] text-[clamp(36px,5.4vw,68px)] text-white">{t("title")}</h2>
          <p className="mt-5 max-w-[52ch] text-[17px] font-medium leading-relaxed text-white/90">{t("lede")}</p>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {items.map((k, i) => (
            <Reveal key={k} delay={70 * i} className="flex">
              <div className="flex flex-1 flex-col gap-1.5 rounded-[20px] bg-cube-body p-1.5 sm:flex-row">
                <div className="sticker-tile grid aspect-[2/1] place-items-center rounded-[15px] bg-white px-6 sm:aspect-square sm:w-[42%] sm:flex-none">
                  <span className="font-display text-[clamp(44px,5vw,64px)] font-extrabold leading-none tracking-[-0.04em] text-cube-red">{t(`${k}.value`)}</span>
                </div>
                <div className="flex flex-col justify-center px-4 pb-4 pt-3 sm:p-5">
                  <h3 className="text-xl text-white">{t(`${k}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/70">{t(`${k}.text`)}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p className="mt-14 max-w-[26ch] font-display text-[clamp(26px,3.4vw,40px)] font-extrabold leading-[1.1] tracking-[-0.03em]">
            {t("punch.a")} {t("punch.b")} {t("punch.c")}
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/*
 * The fix: three rules, one face. The face starts scrambled; each rule you
 * scroll past puts one row of orange in place, bottom first, like the floor.
 * Scroll back up and it scrambles again.
 */
type C = "red" | "orange" | "yellow" | "green" | "blue" | "white";
const FILL: Record<C, string> = {
  red: "bg-cube-red",
  orange: "bg-cube-orange",
  yellow: "bg-cube-yellow",
  green: "bg-cube-green",
  blue: "bg-cube-blue",
  white: "bg-cube-white",
};
const SCRAMBLED: C[] = ["blue", "red", "white", "green", "yellow", "blue", "red", "green", "yellow"];
// rule i solves this row (0 = top)
const ROW_OF_RULE = [2, 1, 0];

function faceAt(step: number): C[] {
  const solved = new Set(ROW_OF_RULE.slice(0, step + 1));
  return SCRAMBLED.map((c, i) => (solved.has(Math.floor(i / 3)) ? "orange" : c));
}

export function RulesStory() {
  const t = useTranslations("home.rules");
  const rules = [
    { k: "pool", tone: "bg-cube-orange text-white" },
    { k: "brake", tone: "bg-cube-yellow text-brake-ink" },
    { k: "keys", tone: "bg-cube-white text-ink border border-line-2" },
  ] as const;
  const [step, setStep] = useState(-1);
  const blocks = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const els = blocks.current.filter((e): e is HTMLDivElement => !!e);
    if (!els.length || typeof IntersectionObserver === "undefined") {
      setStep(2);
      return;
    }
    // a rule is "on" once its block crosses the middle of the screen
    const onScroll = () => {
      const mid = window.innerHeight * 0.55;
      let s = -1;
      els.forEach((el, i) => {
        if (el.getBoundingClientRect().top < mid) s = i;
      });
      setStep(s);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const face = faceAt(step);
  const solved = step >= 2;

  return (
    <section id="rules" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-20 sm:px-6 md:pt-28">
      <Reveal>
        <p className="kicker">{t("kicker")}</p>
        <h2 className="mt-3 max-w-[18ch] text-[clamp(34px,4.6vw,60px)]">{t("title")}</h2>
        <p className="mt-4 max-w-[50ch] text-[17px] leading-relaxed text-ink-2">{t("lede")}</p>
      </Reveal>

      <div className="mt-6 grid gap-x-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* the face: sticky beside the rules on desktop, above them on phones */}
        <div className="sticky top-[calc(var(--header-h)+8px)] z-10 -mx-4 bg-bg px-4 py-4 sm:-mx-6 sm:px-6 lg:top-[max(calc(var(--header-h)+24px),calc(50vh-220px))] lg:order-2 lg:mx-0 lg:h-fit lg:bg-transparent lg:px-0 lg:py-10">
          <div className="mx-auto flex w-[min(44vw,190px)] flex-col items-center lg:w-full lg:max-w-[400px]">
            <div className="cube-face w-full !gap-[5px] !p-[5px] lg:!gap-2 lg:!p-2" aria-hidden>
              {face.map((c, i) => (
                <span
                  key={`${i}-${c}`}
                  className={cn("sticker-tile story-flip aspect-square rounded-[10px] lg:rounded-[14px]", FILL[c])}
                  style={{ animationDelay: `${(i % 3) * 70}ms` }}
                />
              ))}
            </div>
            <p className={cn("mt-3 hidden text-center text-sm font-semibold transition-opacity duration-300 lg:block", solved ? "text-ink opacity-100" : "opacity-0")} aria-live="polite">
              {solved ? t("solved") : " "}
            </p>
          </div>
        </div>

        <div className="lg:order-1">
          {rules.map(({ k, tone }, i) => (
            <div
              key={k}
              ref={(el) => {
                blocks.current[i] = el;
              }}
              className={cn(
                "flex min-h-[58vh] flex-col justify-center py-10 transition-opacity duration-300 lg:min-h-[78vh]",
                i <= step ? "opacity-100" : "opacity-35",
              )}
            >
              <p className="text-sm font-semibold text-ink-3">{t("step", { n: i + 1 })}</p>
              <span className={cn("sticker-tile mt-4 inline-grid h-[clamp(72px,9vw,104px)] w-fit min-w-[clamp(120px,15vw,180px)] place-items-center rounded-[16px] px-6", tone)}>
                <span className="font-display text-[clamp(44px,6vw,72px)] font-extrabold leading-none tracking-[-0.04em]">{t(`${k}.value`)}</span>
              </span>
              <h3 className="mt-6 text-[clamp(24px,2.6vw,32px)]">{t(`${k}.title`)}</h3>
              <p className="mt-3 max-w-[42ch] text-[17px] leading-relaxed text-ink-2">{t(`${k}.text`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** How a coin lives: a blue band, three steps from launch to the floor. */
export function Lifecycle() {
  const t = useTranslations("home.steps");
  const items = [
    { k: "launch", tone: "bg-cube-white text-cube-blue" },
    { k: "graduate", tone: "bg-cube-green text-white" },
    { k: "redeem", tone: "bg-cube-orange text-white" },
  ] as const;
  return (
    <section id="how" className="mt-16 scroll-mt-16 bg-cube-blue text-white md:mt-24">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <Reveal>
          <p className="text-sm font-semibold text-white/75">{t("kicker")}</p>
          <h2 className="mt-3 max-w-[20ch] text-[clamp(34px,4.6vw,60px)] text-white">
            {t("title.a")} {t("title.b")}
          </h2>
        </Reveal>
        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {items.map(({ k, tone }, i) => (
            <Reveal key={k} delay={70 * i} className="flex">
              <li className="flex flex-1 flex-col rounded-[20px] bg-cube-body p-1.5">
                <div className="flex flex-1 flex-col rounded-[15px] bg-white p-6 text-ink">
                  <span className={cn("sticker-tile grid size-12 place-items-center rounded-[12px] text-xl font-extrabold", tone, i === 0 && "border border-line-2")}>{i + 1}</span>
                  <h3 className="mt-6 text-xl">{t(`${k}.title`)}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{t(`${k}.text`)}</p>
                </div>
              </li>
            </Reveal>
          ))}
        </ol>
        <Link href="/how-it-works" className="mt-8 inline-block text-[15px] font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">
          {t("more")}
        </Link>
      </div>
    </section>
  );
}
