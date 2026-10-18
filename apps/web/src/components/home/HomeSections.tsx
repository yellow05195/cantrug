"use client";
import { Check, X } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/layout/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { Scene } from "@/components/ui/Scene";
import { ENV, explorerAddress } from "@/lib/env";

/* Section header (Plush Pons): mono kicker, display title, optional lede and pill. */
export function SectionHead({ kicker, title, lede, cta }: { kicker?: string; title: ReactNode; lede?: ReactNode; cta?: ReactNode }) {
  return (
    <div className="mb-10 flex flex-col items-center gap-3 text-center">
      {kicker ? <p className="kicker">{kicker}</p> : null}
      <h2 className="text-[clamp(30px,4vw,44px)]">{title}</h2>
      {lede ? <p className="mx-auto max-w-2xl text-ink-2">{lede}</p> : null}
      {cta}
    </div>
  );
}

/** Three cards, each topped with its own little drawn city. */
export function FeatureCards() {
  const t = useTranslations("home.features");
  const tg = useTranslations("home.guarantees");
  const items = [
    { k: "floor", href: "/how-it-works#floor" },
    { k: "brake", href: "/how-it-works#brake" },
    { k: "keys", href: "/how-it-works#verify" },
  ] as const;
  return (
    <section id="guarantees" className="mx-auto max-w-6xl scroll-mt-24 px-3 py-20 md:px-6">
      <Reveal>
        <SectionHead title={tg("title")} lede={tg("lede")} />
      </Reveal>
      <div className="grid gap-5 md:grid-cols-3">
        {items.map(({ k, href }, i) => (
          <Reveal key={k} delay={80 * i} className="flex">
          <article className="lift flex flex-1 flex-col overflow-hidden rounded-3xl border border-seam bg-card shadow-[0_10px_40px_-12px_var(--shadow)]">
            <Scene seed={`feature-${k}`} variant={k === "floor" ? "floor" : k === "brake" ? "brake" : "vault"} w={120} h={52} className="h-40" />
            <div className="flex flex-1 flex-col p-6">
              <h3 className="text-xl">{t(`${k}.title`)}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-2">{t(`${k}.text`)}</p>
              <p className="num mt-3 text-xs text-floor">{t(`${k}.formula`)}</p>
              <div className="mt-4">
                <ButtonLink href={href} variant="primary" size="md">
                  {t(`${k}.cta`)}
                </ButtonLink>
              </div>
            </div>
          </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/** Specimen: the redeem calculator. Drag the sliders, watch the receipt. */
export function Specimen() {
  const t = useTranslations("home.specimen");
  const [pool, setPool] = useState(85);
  const [circ, setCirc] = useState(793);
  const [amount, setAmount] = useState(50);
  const share = (pool * amount) / circ;
  const fee = share * 0.005;
  const paid = share - fee;
  const floorBefore = pool / circ;
  const floorAfter = (pool - paid) / (circ - amount);
  const lift = ((floorAfter - floorBefore) / floorBefore) * 100;
  const rows: [string, string, number, number, number, (n: number) => void, string][] = [
    [t("pool"), "SOL", 10, 500, pool, setPool, `${pool} SOL`],
    [t("circ"), "M", 100, 1000, circ, setCirc, `${circ}M`],
    [t("amount"), "M", 1, Math.min(300, circ - 1), amount, setAmount, `${amount}M`],
  ];
  return (
    <section id="specimen" className="mx-auto max-w-6xl scroll-mt-24 px-3 py-20 md:px-6">
      <Reveal>
        <SectionHead title={t("title")} lede={t("lede")} />
      </Reveal>
      <Reveal delay={80}>
      <div className="patch-card mx-auto grid max-w-5xl gap-8 p-6 md:grid-cols-[1fr_320px] md:p-10">
        <div className="flex flex-col gap-6">
          {rows.map(([label, unit, min, max, v, set, show]) => (
            <label key={label} className="block">
              <span className="flex items-baseline justify-between font-mono text-xs uppercase tracking-wider text-ink-2">
                <span>
                  {label} <b className="ml-2 font-bold text-ink">{show}</b>
                </span>
                <span className="text-ink-3">{unit}</span>
              </span>
              <input type="range" min={min} max={max} value={v} onChange={(e) => set(Number(e.target.value))} className="mt-2 w-full accent-[var(--floor)]" />
            </label>
          ))}
          <p className="text-sm text-ink-2">{t("note")}</p>
        </div>
        <div className="well p-5 font-mono text-sm">
          <div className="font-display text-base font-semibold text-ink">{t("receipt")}</div>
          <dl className="mt-3 flex flex-col gap-2 border-t border-dashed border-seam pt-3">
            <Row k={t("rows.share")} v={`${share.toFixed(4)} SOL`} />
            <Row k={t("rows.fee")} v={`− ${fee.toFixed(4)} SOL`} />
            <Row k={t("rows.paid")} v={`${paid.toFixed(4)} SOL`} big />
            <Row k={t("rows.floorBefore")} v={`${floorBefore.toFixed(6)} SOL/M`} />
            <Row k={t("rows.floorAfter")} v={`${floorAfter.toFixed(6)} SOL/M`} />
            <Row k={t("rows.lift")} v={`+${lift.toFixed(3)} %`} up />
          </dl>
          <p className="mt-3 text-[11px] uppercase tracking-wider text-ink-3">{t("moved")}</p>
        </div>
      </div>
      </Reveal>
    </section>
  );
}

function Row({ k, v, big, up }: { k: string; v: string; big?: boolean; up?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-3">{k}</dt>
      <dd className={`num whitespace-nowrap ${big ? "text-xl font-bold text-floor" : up ? "text-up" : "text-ink"}`}>{v}</dd>
    </div>
  );
}

/** How a coin lives: seven steps in one card, rows light up as the section scrolls in. */
export function Flywheel() {
  const t = useTranslations("home.flywheel");
  const ref = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState(-1);
  const steps = ["launch", "curve", "raise", "graduate", "trade", "redeem", "lift"] as const;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const vh = window.innerHeight;
        const progress = Math.max(0, Math.min(1, (vh * 0.85 - r.top) / (r.height * 0.9)));
        setActive(Math.min(steps.length - 1, Math.floor(progress * (steps.length + 1)) - 1));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [steps.length]);
  return (
    <section id="how" ref={ref} className="mx-auto max-w-6xl scroll-mt-24 px-3 py-20 md:px-6">
      <SectionHead
        kicker={t("kicker")}
        title={t("title")}
        cta={
          <ButtonLink href="/how-it-works" variant="primary" size="md">
            {t("cta")}
          </ButtonLink>
        }
      />
      <ol className="overflow-hidden rounded-3xl border border-seam bg-card shadow-[0_10px_40px_-12px_var(--shadow)]">
        {steps.map((k, i) => {
          const on = i <= active;
          const last = i === steps.length - 1;
          return (
            <li key={k} className={`flex items-baseline justify-between gap-4 border-b border-dashed border-seam px-5 py-4 transition-opacity duration-300 last:border-0 md:px-7 ${on ? "opacity-100" : "opacity-45"}`}>
              <span className="flex items-center gap-3">
                <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-full font-mono text-[10px] font-bold transition-colors ${on ? "bg-floor text-floor-ink" : "bg-bg-2 text-ink-3"}`} aria-hidden>
                  {last ? "↻" : "↓"}
                </span>
                <span className="font-display text-base font-semibold md:text-lg">{t(`${k}.title`)}</span>
              </span>
              <span className="hidden text-right text-sm text-ink-2 sm:block">{t(`${k}.detail`)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Against what you already know: the comparison, in a patch card. */
export function Compare() {
  const t = useTranslations("home.compare");
  const rows = ["pool", "min", "drop", "lp", "admin", "dead", "creator"] as const;
  type Cell = "yes" | "no" | (string & {});
  const data: Record<(typeof rows)[number], [Cell, Cell, Cell]> = {
    pool: [t("v.holders"), t("v.burned"), t("v.lps")],
    min: [t("v.floor"), t("v.zero"), t("v.zero")],
    drop: ["−20 % / 60 s", t("v.none"), t("v.none")],
    lp: ["no", "no", "yes"],
    admin: ["no", "no", t("v.depends")],
    dead: [t("v.redeem"), t("v.burnedSol"), t("v.stuck")],
    creator: ["0.4 % → 0.2 %", "≈ 0.3 %", t("v.varies")],
  };
  const cell = (c: Cell, hi: boolean) => {
    if (c === "yes") return <Check size={16} weight="bold" className={hi ? "text-floor" : "text-ink-2"} aria-label={t("yes")} />;
    if (c === "no") return <X size={16} weight="bold" className="text-ink-3" aria-label={t("no")} />;
    return <span className={hi ? "font-semibold text-ink" : "text-ink-2"}>{c}</span>;
  };
  return (
    <section id="compare" className="mx-auto max-w-6xl scroll-mt-24 px-3 py-20 md:px-6">
      <SectionHead kicker={t("kicker")} title={t("title")} lede={t("lede")} />
      <div className="patch-card mx-auto max-w-5xl overflow-x-auto p-3 md:p-5">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
              <th className="px-4 py-3 font-medium" />
              <th className="px-4 py-3 font-bold text-floor">FLOORED</th>
              <th className="px-4 py-3 font-medium">Pump.fun</th>
              <th className="px-4 py-3 font-medium">{t("col.dex")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r} className="border-t border-dashed border-seam">
                <th scope="row" className="px-4 py-3.5 text-left font-display font-semibold text-ink">
                  {t(`row.${r}`)}
                </th>
                <td className="num px-4 py-3.5">{cell(data[r][0], true)}</td>
                <td className="num px-4 py-3.5">{cell(data[r][1], false)}</td>
                <td className="num px-4 py-3.5">{cell(data[r][2], false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mx-auto mt-3 max-w-5xl text-center text-xs text-ink-3">{t("note")}</p>
    </section>
  );
}

/** The math: prose beside the before/after table. */
export function MathSection() {
  const t = useTranslations("home.math");
  const rows: [string, string, string, string, string, boolean][] = [
    [t("rows.before"), "85.00", "206.9M", "793.1M", "0.000 000 107", false],
    [t("rows.redeem"), "79.64", "193.9M", "743.1M", "0.000 000 107", true],
    [t("rows.dump"), "68.06", "243.5M", "693.5M", "0.000 000 098", false],
    [t("rows.arb"), "68.06", "243.5M", "693.5M", "0.000 000 098", true],
  ];
  return (
    <section id="math" className="mx-auto max-w-6xl scroll-mt-24 px-3 py-20 md:px-6">
      <div className="grid gap-8 md:grid-cols-[1fr_1.3fr] md:items-center">
        <div>
          <p className="kicker">{t("kicker")}</p>
          <h2 className="mt-3 text-[clamp(30px,4vw,44px)]">{t("title")}</h2>
          <p className="mt-4 text-ink-2">
            {t("lede.a")} <b className="font-semibold text-ink">{t("lede.b")}</b> {t("lede.c")}
          </p>
          <p className="mt-3 text-sm text-ink-2">{t("more")}</p>
        </div>
        <div className="patch-card overflow-x-auto p-3 md:p-5">
          <table className="num w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-2">
                <th className="px-3 py-2 font-medium">{t("cols.step")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("cols.pool")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("cols.poolTok")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("cols.circ")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("cols.floor")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([a, b, c, d, e, hi]) => (
                <tr key={a} className="border-t border-dashed border-seam">
                  <td className="whitespace-nowrap px-3 py-3 font-display font-semibold text-ink">{a}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-ink-2">{b}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-ink-2">{c}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-ink-2">{d}</td>
                  <td className={`whitespace-nowrap px-3 py-3 text-right ${hi ? "font-bold text-floor" : "text-ink-2"}`}>{e}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 px-3 text-xs text-ink-3">{t("note")}</p>
        </div>
      </div>
    </section>
  );
}

/** Built to be checked: six facts, each a small patch card. */
export function Trust() {
  const t = useTranslations("home.trust");
  const facts = ["source", "fuzz", "tests", "paths", "mint", "frozen"] as const;
  return (
    <section id="trust" className="mx-auto max-w-6xl scroll-mt-24 px-3 py-20 md:px-6">
      <SectionHead kicker={t("kicker")} title={t("title")} lede={t("lede")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {facts.map((k) => (
          <div key={k} className="patch-card p-5">
            <p className="num text-sm font-bold text-floor">{t(`${k}.k`)}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{t(`${k}.v`)}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <ButtonLink href="/how-it-works#verify" variant="primary" size="md">
          {t("verify")}
        </ButtonLink>
        <ButtonLink href="/challenge" variant="secondary" size="md">
          {t("challenge")}
        </ButtonLink>
      </div>
      <p className="mt-4 text-center font-mono text-[11px] uppercase tracking-wider text-ink-3">
        <a href={explorerAddress(ENV.programId)} target="_blank" rel="noreferrer" className="hover:text-ink">
          {t("program")} {ENV.programId.slice(0, 6)}…{ENV.programId.slice(-6)} ↗
        </a>
      </p>
    </section>
  );
}

/** FAQ: patch cards that open one at a time. */
export function Faq() {
  const t = useTranslations("home.faq");
  const keys = ["what", "zero", "sell", "brake", "fees", "verify"] as const;
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-3 py-20 md:px-6">
      <h2 className="mb-10 text-center text-[clamp(30px,4vw,44px)]">{t("title")}</h2>
      <div className="flex flex-col gap-3">
        {keys.map((k, i) => (
          <div key={k} className="patch-card overflow-hidden">
            <button type="button" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full items-center justify-between gap-4 p-5 text-left font-display font-semibold text-ink">
              {t(`${k}.q`)}
              <span className="font-mono text-floor transition-transform" style={{ transform: open === i ? "rotate(45deg)" : "none" }} aria-hidden>
                +
              </span>
            </button>
            <div className="grid transition-[grid-template-rows] duration-300" style={{ gridTemplateRows: open === i ? "1fr" : "0fr" }}>
              <div className="overflow-hidden">
                <p className="px-5 pb-5 text-sm leading-relaxed text-ink-2">{t(`${k}.a`)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Closing banner: one scene, one frosted card, one button. */
export function FinalCta() {
  const t = useTranslations("home.band");
  return (
    <section className="mx-auto max-w-6xl px-3 pb-6 pt-4 md:px-6">
      <Reveal>
      <div className="relative overflow-hidden rounded-3xl border border-seam shadow-[0_24px_70px_-20px_var(--shadow)]">
        <Scene seed="final" variant="city" w={200} h={70} className="h-[340px]" />
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-md p-7 text-center md:p-9">
            <h2 className="text-[clamp(26px,3.4vw,36px)]">{t("title")}</h2>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-ink-2">{t("text")}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/create" variant="primary" size="md">
                {t("cta")}
              </ButtonLink>
              <Link href="/how-it-works" className="inline-flex h-11 items-center text-sm text-ink-2 underline decoration-dashed underline-offset-4 hover:text-ink">
                {t("how")}
              </Link>
            </div>
          </div>
        </div>
      </div>
      </Reveal>
    </section>
  );
}
