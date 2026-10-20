"use client";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { ENV } from "@/lib/env";
import { Cube, type FaceColors } from "./Cube";

/*
 * Turn the cube. The homepage is one cube pinned to the screen; scrolling
 * turns it a quarter at a time and each face is a chapter. The page takes the
 * colour of the face you are looking at. It starts on white (the promise),
 * turns to red (the problem), green, yellow and blue (the three rules), and
 * lands on orange, the bottom face: the floor.
 */

const FACES: FaceColors = {
  front: "var(--cube-white)",
  right: "var(--cube-red)",
  back: "var(--cube-green)",
  left: "var(--cube-yellow)",
  top: "var(--cube-blue)",
  bottom: "var(--cube-orange)",
};

type Chapter = {
  k: "intro" | "problem" | "pool" | "brake" | "keys" | "floor";
  /** cube orientation that brings this chapter's face to the front */
  rx: number;
  ry: number;
  bg: string;
  dark: boolean; // white text on this ground
  sticker: string;
};
const CHAPTERS: Chapter[] = [
  { k: "intro", rx: 0, ry: 0, bg: "var(--bg)", dark: false, sticker: "bg-cube-white" },
  { k: "problem", rx: 0, ry: -90, bg: "var(--cube-red)", dark: true, sticker: "bg-cube-red" },
  { k: "pool", rx: 0, ry: -180, bg: "var(--cube-green)", dark: false, sticker: "bg-cube-green" },
  { k: "brake", rx: 0, ry: -270, bg: "var(--cube-yellow)", dark: false, sticker: "bg-cube-yellow" },
  { k: "keys", rx: -90, ry: -270, bg: "var(--cube-blue)", dark: true, sticker: "bg-cube-blue" },
  { k: "floor", rx: -270, ry: -270, bg: "var(--cube-orange)", dark: false, sticker: "bg-cube-orange" },
];
const LAST = CHAPTERS.length - 1;
const VIEW = "rotateX(-22deg) rotateY(-30deg)";

const smooth = (t: number) => t * t * (3 - 2 * t);

/** How far the current quarter turn has gone, 0 to 1. The cube rests on each face for a while, then turns. */
function turnAt(p: number): number {
  const i = Math.min(LAST - 1, Math.floor(p));
  return smooth(Math.max(0, Math.min(1, (p - i - 0.3) / 0.4)));
}

/** Scroll position → orientation. */
function orientAt(p: number): { rx: number; ry: number } {
  const i = Math.min(LAST - 1, Math.floor(p));
  const t = turnAt(p);
  const a = CHAPTERS[i]!;
  const b = CHAPTERS[i + 1]!;
  return { rx: a.rx + (b.rx - a.rx) * t, ry: a.ry + (b.ry - a.ry) * t };
}

export function TurnTheCube() {
  const t = useTranslations("home.turn");
  const tn = useTranslations("nav");
  const track = useRef<HTMLDivElement>(null);
  const cube = useRef<HTMLDivElement | null>(null);
  const base = useRef<HTMLDivElement>(null);
  const sweep = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const frame = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const span = Math.max(1, r.height - window.innerHeight);
      const p = Math.max(0, Math.min(1, -r.top / span)) * LAST;
      const i = Math.min(LAST - 1, Math.floor(p));
      const t = turnAt(p);
      // the words change once the new colour has swept past them
      const near = reduce ? Math.min(LAST, Math.floor(p + 0.5)) : i + (t >= 0.7 ? 1 : 0);
      setActive(near);
      const o = reduce ? CHAPTERS[near]! : orientAt(p);
      if (cube.current) cube.current.style.transform = `${VIEW} rotateX(${o.rx}deg) rotateY(${o.ry}deg)`;
      // the page turns with the cube: the next face's colour slides in from
      // the side it comes from, a strip of black plastic on its leading edge
      const b = base.current;
      const s = sweep.current;
      if (b && s) {
        if (reduce) {
          b.style.backgroundColor = CHAPTERS[near]!.bg;
          s.style.visibility = "hidden";
          return;
        }
        const from = CHAPTERS[i]!;
        const to = CHAPTERS[i + 1]!;
        const vertical = from.rx !== to.rx;
        const rest = 1 - t;
        b.style.backgroundColor = from.bg;
        s.style.backgroundColor = to.bg;
        s.style.visibility = t > 0 ? "visible" : "hidden";
        s.style.boxShadow = vertical ? "0 10px 0 var(--cube-body)" : "-10px 0 0 var(--cube-body)";
        s.style.transform = vertical ? `translate3d(0, calc(${-rest * 100}% - ${rest * 14}px), 0)` : `translate3d(calc(${rest * 100}% + ${rest * 14}px), 0, 0)`;
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    frame();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /** Jump to a chapter: scroll to the middle of its stretch of the track. */
  const goTo = (i: number) => {
    const el = track.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const span = el.offsetHeight - window.innerHeight;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: top + (span * i) / LAST, behavior: reduce ? "auto" : "smooth" });
  };

  const ch = CHAPTERS[active]!;

  return (
    <div ref={track} className="relative -mt-[var(--header-h)]" style={{ height: `${CHAPTERS.length * 100}dvh` }}>
      <section
        className={cn("sticky top-0 h-dvh overflow-hidden transition-colors duration-300", ch.dark ? "text-white" : "text-ink")}
        aria-label={t("label")}
      >
        <div ref={base} aria-hidden className="absolute inset-0" style={{ backgroundColor: CHAPTERS[0]!.bg }} />
        <div ref={sweep} aria-hidden className="absolute inset-0 will-change-transform" style={{ visibility: "hidden" }} />
        <div className="relative mx-auto grid h-full max-w-6xl grid-rows-[minmax(0,0.9fr)_minmax(0,1.1fr)] px-4 [@media(max-height:760px)]:grid-rows-[minmax(0,0.6fr)_minmax(0,1.4fr)] pb-6 pt-[calc(var(--header-h)+8px)] sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-1 lg:gap-10 lg:pb-0">
          {/* the cube */}
          <div className="relative flex items-center justify-center lg:order-2">
            <div aria-hidden className="absolute bottom-[10%] left-1/2 h-8 w-[52%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(17,18,22,0.32),transparent)] blur-md" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="origin-center scale-[0.5] sm:scale-[0.66] lg:scale-[0.92] [@media(max-height:760px)]:scale-[0.38] lg:[@media(max-height:760px)]:scale-[0.7]">
                <Cube size={92} colors={FACES} still cubeRef={cube} />
              </div>
            </div>
          </div>

          {/* the words: every chapter is in the page, the current one is shown */}
          <div className="relative lg:order-1">
            {CHAPTERS.map((c, i) => (
              <div
                key={c.k}
                className={cn(
                  "absolute inset-x-0 top-0 flex h-full flex-col justify-start transition-[opacity,transform] duration-500 ease-out lg:justify-center",
                  i === active ? "translate-y-0 opacity-100" : cn("pointer-events-none opacity-0", i < active ? "-translate-y-3" : "translate-y-3"),
                )}
                aria-hidden={i !== active}
                inert={i !== active}
              >
                <ChapterBody k={c.k} dark={c.dark} t={t} mockLabel={ENV.mock ? t("intro.demo") : null} mockHint={tn("mockHint")} />
              </div>
            ))}
          </div>
        </div>

        {/* chapters, as six stickers: where you are, and a way to jump */}
        <nav aria-label={t("chapters")} className="absolute right-3 top-1/2 hidden -translate-y-1/2 flex-col gap-1.5 rounded-[12px] bg-cube-body p-1.5 sm:flex lg:right-6">
          {CHAPTERS.map((c, i) => (
            <button
              key={c.k}
              type="button"
              onClick={() => goTo(i)}
              aria-label={t(`${c.k}.kicker`)}
              aria-current={i === active ? "step" : undefined}
              className={cn("sticker-tile press size-4 rounded-[4px] transition-transform duration-200", c.sticker, i === active ? "scale-100" : "scale-75 opacity-60 hover:opacity-100")}
            />
          ))}
        </nav>

        {active === 0 ? (
          <p aria-hidden className="pointer-events-none absolute bottom-5 left-1/2 hidden -translate-x-1/2 text-sm font-medium text-ink-3 lg:block">
            {t("scroll")}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function ChapterBody({ k, dark, t, mockLabel, mockHint }: { k: Chapter["k"]; dark: boolean; t: ReturnType<typeof useTranslations>; mockLabel: string | null; mockHint: string }) {
  const soft = dark ? "text-white/85" : "text-ink/75";
  const lede = cn("mt-4 max-w-[46ch] text-[16px] font-medium leading-relaxed sm:text-[18px] [@media(max-height:760px)]:mt-3 [@media(max-height:760px)]:text-[15px]", soft);
  const kicker = cn("text-sm font-semibold", dark ? "text-white/75" : "text-ink/60");

  if (k === "intro") {
    return (
      <>
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-2">
          <span className="inline-flex items-center gap-2">
            <span className="size-2 rounded-[3px] bg-cube-green ring-2 ring-cube-green/25" aria-hidden />
            {t("intro.kicker")}
          </span>
          {mockLabel ? (
            <span className="chip-mono !h-6 !text-xs" title={mockHint}>
              {mockLabel}
            </span>
          ) : null}
        </p>
        <h1 className="mt-4 text-[clamp(40px,6.2vw,84px)] [@media(max-height:760px)]:text-[clamp(34px,5vw,64px)]">
          {t("intro.a")} <span className="text-cube-orange">{t("intro.b")}</span>
        </h1>
        <p className="mt-5 max-w-[46ch] text-[16px] leading-relaxed text-ink-2 sm:text-[18px] [@media(max-height:760px)]:mt-3 [@media(max-height:760px)]:text-[15px]">{t("intro.text")}</p>
        <div className="mt-7 flex flex-wrap items-center gap-3 [@media(max-height:760px)]:mt-5">
          <ButtonLink href="/create" variant="primary" size="lg">
            {t("intro.launch")}
          </ButtonLink>
          <ButtonLink href="#live" variant="secondary" size="lg">
            {t("intro.coins")}
          </ButtonLink>
        </div>
      </>
    );
  }

  if (k === "problem") {
    return (
      <>
        <p className={kicker}>{t("problem.kicker")}</p>
        <h2 className="mt-3 max-w-[15ch] text-[clamp(34px,5vw,64px)]">{t("problem.title")}</h2>
        <p className={lede}>{t("problem.text")}</p>
        <dl className="mt-6 grid [@media(max-height:760px)]:mt-4 max-w-[520px] grid-cols-2 gap-2 rounded-[18px] bg-cube-body p-1.5">
          {(["dump", "dead"] as const).map((f) => (
            <div key={f} className="rounded-[13px] bg-white p-4 text-ink">
              <dt className="font-display text-[clamp(32px,4vw,48px)] font-extrabold leading-none tracking-[-0.04em] text-cube-red">{t(`problem.${f}.v`)}</dt>
              <dd className="mt-2 text-sm leading-snug text-ink-2">{t(`problem.${f}.k`)}</dd>
            </div>
          ))}
        </dl>
      </>
    );
  }

  if (k === "floor") {
    return (
      <>
        <p className={kicker}>{t("floor.kicker")}</p>
        <h2 className="mt-3 max-w-[14ch] text-[clamp(34px,5vw,64px)]">{t("floor.title")}</h2>
        <p className={lede}>{t("floor.text")}</p>
        <p className="mt-5 [@media(max-height:760px)]:mt-3 inline-flex w-fit items-center gap-3 rounded-[12px] bg-cube-body px-4 py-3 font-mono text-[15px] text-white sm:text-base">
          <span className="text-cube-orange">{t("floor.formulaK")}</span>
          {t("floor.formula")}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3 [@media(max-height:760px)]:mt-4">
          <ButtonLink href="/create" variant="light" size="lg">
            {t("floor.launch")}
          </ButtonLink>
          <ButtonLink href="/how-it-works" variant="secondary" size="lg">
            {t("floor.how")}
          </ButtonLink>
        </div>
      </>
    );
  }

  // the three rules: one big number on a sticker, a line, the detail
  const tone = k === "keys" ? "bg-white text-cube-blue" : k === "pool" ? "bg-white text-cube-green" : "bg-cube-body text-cube-yellow";
  return (
    <>
      <p className={kicker}>{t(`${k}.kicker`)}</p>
      <span className={cn("sticker-tile mt-4 inline-grid h-[clamp(64px,8vw,96px)] w-fit min-w-[clamp(112px,13vw,168px)] place-items-center rounded-[16px] px-6", tone)}>
        <span className="font-display text-[clamp(40px,5.4vw,66px)] font-extrabold leading-none tracking-[-0.04em]">{t(`${k}.value`)}</span>
      </span>
      <h2 className="mt-5 max-w-[16ch] text-[clamp(30px,4.2vw,54px)]">{t(`${k}.title`)}</h2>
      <p className={lede}>{t(`${k}.text`)}</p>
      {k === "keys" ? (
        <ol className="mt-5 flex max-w-[520px] flex-wrap gap-2">
          {(["s1", "s2", "s3"] as const).map((s, i) => (
            <li key={s} className="inline-flex items-center gap-2 rounded-[10px] bg-white/15 py-1.5 pl-1.5 pr-3 text-sm font-semibold">
              <span className="grid size-6 place-items-center rounded-[6px] bg-white text-xs font-extrabold text-cube-blue">{i + 1}</span>
              {t(`keys.${s}`)}
            </li>
          ))}
        </ol>
      ) : null}
    </>
  );
}
