import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { BrakeDiagram, CompareDiagram, VerifyDiagram } from "@/components/how/Diagrams";
import { FloorDiagram } from "@/components/how/FloorDiagram";
import { ReadOnChain } from "@/components/how/ReadOnChain";
import { Flywheel, Specimen } from "@/components/home/HomeSections";
import { LevelRule } from "@/components/ui/Floor";
import { PageHeader } from "@/components/ui/PageHeader";
import { ENV, explorerAddress } from "@/lib/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("how");
  return { title: t("metaTitle"), description: t("lede") };
}

const FORMULAS = ["floor = S / C", "C = supply − T − Q", "redeem(x) = S·x / C − 0.5 %", "brake: price ≥ 0.8 × price_window_start"];

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mx-auto mt-24 max-w-[760px] scroll-mt-28 text-center text-[clamp(28px,3.6vw,40px)] leading-[1.1]">
      {children}
    </h2>
  );
}

/** A drawn diagram in a well, with a short caption under it. */
function Drawing({ children, caption, label }: { children: React.ReactNode; caption: React.ReactNode; label: string }) {
  return (
    <figure className="my-10">
      <div role="img" aria-label={label} className="well flex items-end overflow-hidden px-4 pt-6 sm:px-6 sm:pt-8">
        <div className="w-full">{children}</div>
      </div>
      <figcaption className="mt-3 text-center text-sm text-ink-2">{caption}</figcaption>
    </figure>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[1.0625rem] leading-[1.65] text-ink-2">{children}</p>;
}

export default async function HowItWorks() {
  const t = await getTranslations("how");
  const faq = ["zero", "promise", "rug", "queue", "creator", "audit"] as const;
  return (
    <article className="mx-auto w-full max-w-[760px] px-4 sm:px-6">
      <PageHeader face="yellow" kicker={t("kicker")} title={t("title")} lede={t("lede")} />
      <nav aria-label={t("tocLabel")} className="mt-10 flex flex-wrap justify-center gap-2">
        {(["problem", "floor", "brake", "compare", "verify", "fees", "faq"] as const).map((k) => (
          <a key={k} href={`#${k}`} className="chip-mono transition-colors duration-150 hover:text-ink">
            {t(`toc.${k}`)}
          </a>
        ))}
      </nav>

      <H2 id="problem">{t("problem.title")}</H2>
      <P>{t("problem.p1")}</P>
      <P>{t("problem.p2")}</P>

      <div className="-mx-4 sm:-mx-6">
        <Flywheel />
      </div>

      <H2 id="floor">{t("floor.title")}</H2>
      <P>{t("floor.p1")}</P>
      <FloorDiagram />
      <P>{t("floor.p2")}</P>
      <P>{t("floor.p3")}</P>

      <div className="-mx-4 sm:-mx-6">
        <Specimen />
      </div>

      <H2 id="brake">{t("brake.title")}</H2>
      <P>{t("brake.p1")}</P>
      <Drawing caption={t("brake.caption")} label={t("brake.alt")}>
        <BrakeDiagram className="h-auto w-full" />
      </Drawing>
      <P>{t("brake.p2")}</P>
      <P>{t("brake.p3")}</P>

      <H2 id="compare">{t("compare.title")}</H2>
      <P>{t("compare.p1")}</P>
      <Drawing
        label={t("compare.alt")}
        caption={
          <span className="grid grid-cols-2 gap-4">
            <span>{t("compare.left")}</span>
            <span>{t("compare.right")}</span>
          </span>
        }
      >
        <CompareDiagram className="h-auto w-full" />
      </Drawing>
      <P>{t("compare.p2")}</P>

      <H2 id="verify">{t("verify.title")}</H2>
      <P>{t("verify.p1")}</P>
      <div className="patch-card my-8 p-6">
        <ul className="num space-y-2 text-[0.9375rem]">
          {FORMULAS.map((f, i) => (
            <li key={f} className={i === 0 ? "text-floor" : "text-ink"}>
              {f}
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-dashed border-seam pt-3 text-sm text-ink-2">{t("verify.legend")}</p>
      </div>
      <Drawing caption={t("verify.diagramCaption")} label={t("verify.diagramCaption")}>
        <VerifyDiagram className="h-auto w-full" />
      </Drawing>
      <P>{t("verify.p2")}</P>
      <ul className="mt-4 space-y-1.5 text-sm text-ink-2">
        <li>
          <span className="text-ink">CoinState</span>: {t("verify.a1")}
        </li>
        <li>
          <span className="text-ink">{t("verify.vault")}</span>: {t("verify.a2")}
        </li>
        <li>
          <span className="text-ink">{t("verify.mint")}</span>: {t("verify.a3")}
        </li>
      </ul>
      <p className="mt-4 text-sm text-ink-3">
        {t("verify.program")}{" "}
        <a href={explorerAddress(ENV.programId)} target="_blank" rel="noreferrer" className="num break-all text-ink-2 hover:text-ink">
          {ENV.programId}
        </a>
      </p>
      <ReadOnChain />

      <H2 id="fees">{t("fees.title")}</H2>
      <dl className="patch-card mt-6 divide-y divide-dashed divide-seam px-6 py-3 text-md">
        {(["curve", "pool", "redeem", "create"] as const).map((k) => (
          <div key={k} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr]">
            <dt className="text-ink">{t(`fees.${k}.k`)}</dt>
            <dd className="text-ink-2">{t(`fees.${k}.v`)}</dd>
          </div>
        ))}
      </dl>
      <P>{t("fees.honest")}</P>

      <H2 id="faq">{t("faq.title")}</H2>
      <div className="mt-6 space-y-3">
        {faq.map((k) => (
          <details key={k} className="patch-card group px-6">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-display text-base font-semibold">
              {t(`faq.${k}.q`)}
              <span aria-hidden className="num text-lg text-floor transition-transform duration-150 group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="pb-5 text-md leading-relaxed text-ink-2">{t(`faq.${k}.a`)}</p>
          </details>
        ))}
      </div>

      <LevelRule className="mt-20" label={t("end")} />
      <p className="mt-6 text-md">
        <Link href="/challenge" className="underline decoration-line-2 underline-offset-4 hover:decoration-ink">
          {t("toChallenge")}
        </Link>
      </p>
    </article>
  );
}
