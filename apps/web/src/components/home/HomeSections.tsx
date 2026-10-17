"use client";
import { Check, Minus, X } from "@phosphor-icons/react/dist/ssr";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Reveal } from "@/components/layout/Reveal";
import { ButtonLink } from "@/components/ui/Button";
import { Photo } from "@/components/ui/Photo";
import { ENV, explorerAddress } from "@/lib/env";

/**
 * Flat editorial sections. Title left (sticky), content right. Grids are
 * drawn with 1 px gaps on a hairline background, never with cards floating
 * on shadows. Photographs sit in square frames.
 */
export function Section({ id, title, lede, children, className = "" }: { id: string; title: ReactNode; lede?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-20 border-b border-line py-16 sm:py-20 ${className}`}>
      <div className="grid gap-8 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:gap-12">
        <Reveal>
          <div className="md:sticky md:top-24">
            <h2 className="text-[clamp(26px,3.2vw,38px)]">{title}</h2>
            {lede ? <p className="mt-4 max-w-[38ch] text-ink-2">{lede}</p> : null}
          </div>
        </Reveal>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

/** How a coin lives: three steps, three photographs. */
export function Steps() {
  const t = useTranslations("home.steps");
  const steps = ["curve", "floor", "brake"] as const;
  return (
    <ol className="grid gap-px border border-line bg-line md:grid-cols-3">
      {steps.map((k, i) => (
        <li key={k} className="bg-bg">
          <Reveal delay={60 * i}>
            <Photo id={k} ratio="4/3" sizes="(min-width: 768px) 33vw, 100vw" className="border-0 border-b" />
            <div className="p-5">
              <p className="num text-xs text-ink-3">0{i + 1}</p>
              <h3 className="mt-2 text-xl">{t(`${k}.title`)}</h3>
              <p className="mt-2 text-sm text-ink-2">{t(`${k}.text`)}</p>
              <p className="num mt-4 border-t border-line pt-3 text-xs text-floor">{t(`${k}.formula`)}</p>
            </div>
          </Reveal>
        </li>
      ))}
    </ol>
  );
}

/** FLOORED against the two things people already know. */
export function Compare() {
  const t = useTranslations("home.compare");
  const rows = ["pool", "min", "drop", "lp", "admin", "dead", "creator"] as const;
  type Cell = "yes" | "no" | "na" | (string & {});
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
    if (c === "na") return <Minus size={16} className="text-ink-3" />;
    return <span className={hi ? "text-ink" : "text-ink-2"}>{c}</span>;
  };
  return (
    <Reveal>
      <div className="overflow-x-auto border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-bg-2 text-left text-xs text-ink-3">
              <th className="px-4 py-3 font-medium">{t("col.what")}</th>
              <th className="px-4 py-3 font-semibold text-ink">FLOORED</th>
              <th className="px-4 py-3 font-medium">Pump.fun</th>
              <th className="px-4 py-3 font-medium">{t("col.dex")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r} className="border-t border-line">
                <th scope="row" className="px-4 py-3.5 text-left font-medium text-ink-2">
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
      <p className="mt-3 text-xs text-ink-3">{t("note")}</p>
    </Reveal>
  );
}

/** The redeem receipt: a worked example on the default curve. */
export function Receipt() {
  const t = useTranslations("home.receipt");
  const rows: [string, string, boolean?][] = [
    [t("rows.tokens"), "50 000 000"],
    [t("rows.pool"), "85.00 SOL"],
    [t("rows.circulating"), "793 100 000"],
    [t("rows.share"), "5.3587 SOL"],
    [t("rows.fee"), "− 0.0268 SOL"],
    [t("rows.paid"), "5.3319 SOL", true],
    [t("rows.price"), "0.00 %"],
  ];
  return (
    <div className="border border-line bg-bg-2">
      <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
        <span className="text-sm font-semibold text-ink">{t("title")}</span>
        <span className="num text-xs text-ink-3">{t("subtitle")}</span>
      </div>
      <dl className="divide-y divide-line">
        {rows.map(([k, v, big]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
            <dt className="text-sm text-ink-2">{k}</dt>
            <dd className={`num whitespace-nowrap ${big ? "text-lg text-floor" : "text-sm text-ink"}`}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The math: prose, the receipt, the before/after table. */
export function Math() {
  const t = useTranslations("home.math");
  const rows: [string, string, string, string, string, boolean][] = [
    [t("rows.before"), "85.00", "206.9M", "793.1M", "0.000 000 107", false],
    [t("rows.redeem"), "79.64", "193.9M", "743.1M", "0.000 000 107", true],
    [t("rows.dump"), "68.06", "243.5M", "693.5M", "0.000 000 098", false],
    [t("rows.arb"), "68.06", "243.5M", "693.5M", "0.000 000 098", true],
  ];
  return (
    <>
      <Reveal>
        <p className="max-w-[62ch] text-ink-2">
          {t("lede.a")} <b className="font-semibold text-ink">{t("lede.b")}</b> {t("lede.c")}
        </p>
        <p className="mt-4 max-w-[62ch] text-ink-2">{t("more")}</p>
      </Reveal>
      <div className="mt-8 grid gap-6 xl:grid-cols-[300px_1fr]">
        <Reveal delay={60} className="min-w-0">
          <div className="max-w-[420px]">
            <Receipt />
          </div>
        </Reveal>
        <Reveal delay={120} className="min-w-0">
          <div className="overflow-x-auto border border-line">
            <table className="num w-full min-w-[520px] text-xs sm:text-sm">
              <thead>
                <tr className="bg-bg-2 text-left text-xs text-ink-3">
                  <th className="px-4 py-3 font-sans font-medium">{t("cols.step")}</th>
                  <th className="px-4 py-3 text-right font-sans font-medium">{t("cols.pool")}</th>
                  <th className="px-4 py-3 text-right font-sans font-medium">{t("cols.poolTok")}</th>
                  <th className="px-4 py-3 text-right font-sans font-medium">{t("cols.circ")}</th>
                  <th className="px-4 py-3 text-right font-sans font-medium">{t("cols.floor")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([a, b, c, d, e, hi]) => (
                  <tr key={a} className="border-t border-line">
                    <td className="whitespace-nowrap px-4 py-3 font-sans text-ink">{a}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-ink-2">{b}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-ink-2">{c}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-ink-2">{d}</td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right ${hi ? "text-floor" : "text-ink-2"}`}>{e}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink-3">{t("note")}</p>
        </Reveal>
      </div>
    </>
  );
}

/** Built to be checked: a photograph and the facts that can be verified. */
export function Trust() {
  const t = useTranslations("home.trust");
  const facts = ["source", "fuzz", "tests", "paths", "mint", "frozen"] as const;
  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Reveal>
        <Photo id="vault" ratio="1/1" sizes="(min-width: 1024px) 360px, 100vw" caption={<span>{t("caption")}</span>} />
      </Reveal>
      <Reveal delay={60}>
        <ul className="border-t border-line">
          {facts.map((k) => (
            <li key={k} className="grid gap-1 border-b border-line py-3.5 sm:grid-cols-[180px_1fr] sm:gap-6">
              <span className="num text-sm text-ink">{t(`${k}.k`)}</span>
              <span className="text-sm text-ink-2">{t(`${k}.v`)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <ButtonLink href="/how-it-works#verify" variant="secondary" size="md">
            {t("verify")}
          </ButtonLink>
          <ButtonLink href="/challenge" variant="secondary" size="md">
            {t("challenge")}
          </ButtonLink>
          <a href={explorerAddress(ENV.programId)} target="_blank" rel="noreferrer" className="num text-xs text-ink-3 hover:text-ink">
            {ENV.programId.slice(0, 8)}…{ENV.programId.slice(-6)}
          </a>
        </div>
      </Reveal>
    </div>
  );
}

/** FAQ: details rows. */
export function Faq() {
  const t = useTranslations("home.faq");
  const keys = ["what", "zero", "sell", "brake", "fees", "verify"] as const;
  return (
    <div className="border-t border-line">
      {keys.map((k) => (
        <details key={k} className="faq border-b border-line py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-ink">
            {t(`${k}.q`)}
            <span className="faq-icon num text-lg leading-none text-ink-3" aria-hidden="true">
              +
            </span>
          </summary>
          <p className="mt-3 max-w-[64ch] text-sm text-ink-2">{t(`${k}.a`)}</p>
        </details>
      ))}
    </div>
  );
}

/** Closing: the horizon photograph and one sentence. */
export function Launch() {
  const t = useTranslations("home.band");
  return (
    <div className="grid gap-px border border-line bg-line lg:grid-cols-2">
      <Photo id="horizon" ratio="3/2" sizes="(min-width: 1024px) 50vw, 100vw" className="border-0" />
      <div className="flex flex-col justify-center bg-bg p-6 sm:p-10">
        <h2 className="text-[clamp(26px,3vw,36px)]">{t("title")}</h2>
        <p className="mt-4 max-w-[44ch] text-ink-2">{t("text")}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/create" variant="primary" size="lg">
            {t("cta")}
          </ButtonLink>
          <ButtonLink href="/how-it-works" variant="secondary" size="lg">
            {t("how")}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
