import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PortfolioView } from "@/components/portfolio/PortfolioView";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portfolio");
  return { title: t("title") };
}

export default async function PortfolioPage() {
  const t = await getTranslations("portfolio");
  return (
    <div className="gutter mx-auto max-w-[1280px] pt-10 lg:pt-14">
      <h1 className="display-tight text-3xl font-extrabold sm:text-4xl">{t("title")}</h1>
      <p className="mt-3 max-w-[60ch] text-md text-ink-2">{t("lede")}</p>
      <div className="mt-10">
        <PortfolioView />
      </div>
    </div>
  );
}
