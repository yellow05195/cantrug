import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import brakeImg from "../../../public/assets/howitworks-brake.webp";
import compareImg from "../../../public/assets/howitworks-compare.webp";
import { FloorDiagram } from "@/components/how/FloorDiagram";
import { ReadOnChain } from "@/components/how/ReadOnChain";
import { LevelRule } from "@/components/ui/Floor";
import { ENV, explorerAddress } from "@/lib/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("how");
  return { title: t("metaTitle"), description: t("lede") };
}

const FORMULAS = ["floor = S / C", "C = supply − T − Q", "redeem(x) = S·x / C − 0.5 %", "brake: price ≥ 0.8 × price_window_start"];

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="title-tight mt-20 scroll-mt-24 text-2xl font-semibold sm:text-[1.75rem]">
      {children}
    </h2>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[1.0625rem] leading-[1.65] text-ink-2">{children}</p>;
}

export default async function HowItWorks() {
  const t = await getTranslations("how");
  const faq = ["zero", "promise", "rug", "queue", "creator", "audit"] as const;
  return (
    <article className="gutter mx-auto max-w-[70ch] pt-12 lg:pt-20">
      <h1 className="display-tight text-4xl font-semibold leading-[1.05] sm:text-5xl">{t("title")}</h1>
      <p className="mt-6 text-lg text-ink-2">{t("lede")}</p>
      <nav aria-label={t("tocLabel")} className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-y border-line py-3 text-sm">
        {(["problem", "floor", "brake", "compare", "verify", "fees", "faq"] as const).map((k) => (
          <a key={k} href={`#${k}`} className="text-ink-2 hover:text-ink">
            {t(`toc.${k}`)}
          </a>
        ))}
      </nav>

      <H2 id="problem">{t("problem.title")}</H2>
      <P>{t("problem.p1")}</P>
      <P>{t("problem.p2")}</P>

      <H2 id="floor">{t("floor.title")}</H2>
      <P>{t("floor.p1")}</P>
      <FloorDiagram />
      <P>{t("floor.p2")}</P>
      <P>{t("floor.p3")}</P>

      <H2 id="brake">{t("brake.title")}</H2>
      <P>{t("brake.p1")}</P>
      <figure className="my-10">
        <Image src={brakeImg} alt={t("brake.alt")} placeholder="blur" sizes="(min-width: 768px) 70ch, 100vw" className="h-auto w-full rounded-sm border border-line" />
        <figcaption className="mt-3 text-sm text-ink-2">{t("brake.caption")}</figcaption>
      </figure>
      <P>{t("brake.p2")}</P>
      <P>{t("brake.p3")}</P>

      <H2 id="compare">{t("compare.title")}</H2>
      <P>{t("compare.p1")}</P>
      <figure className="my-10">
        <Image src={compareImg} alt={t("compare.alt")} placeholder="blur" sizes="(min-width: 768px) 70ch, 100vw" className="h-auto w-full rounded-sm border border-line" />
        <figcaption className="mt-3 grid grid-cols-2 gap-4 text-sm text-ink-2">
          <span>{t("compare.left")}</span>
          <span>{t("compare.right")}</span>
        </figcaption>
      </figure>
      <P>{t("compare.p2")}</P>

      <H2 id="verify">{t("verify.title")}</H2>
      <P>{t("verify.p1")}</P>
      <div className="my-8 rounded-sm border border-line bg-bg-2 p-4">
        <ul className="num space-y-2 text-[0.9375rem]">
          {FORMULAS.map((f, i) => (
            <li key={f} className={i === 0 ? "text-floor" : "text-ink"}>
              {f}
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-line pt-3 text-sm text-ink-3">{t("verify.legend")}</p>
      </div>
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
      <dl className="mt-6 divide-y divide-line border-y border-line text-md">
        {(["curve", "pool", "redeem", "create"] as const).map((k) => (
          <div key={k} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr]">
            <dt className="text-ink">{t(`fees.${k}.k`)}</dt>
            <dd className="text-ink-2">{t(`fees.${k}.v`)}</dd>
          </div>
        ))}
      </dl>
      <P>{t("fees.honest")}</P>

      <H2 id="faq">{t("faq.title")}</H2>
      <div className="mt-6 border-t border-line">
        {faq.map((k) => (
          <details key={k} className="group border-b border-line">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-md font-medium">
              {t(`faq.${k}.q`)}
              <span aria-hidden className="num text-ink-3 transition-transform duration-150 group-open:rotate-45">
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
