import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PortfolioView } from "@/components/portfolio/PortfolioView";
import { PAGE, PageHeader } from "@/components/ui/PageHeader";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("portfolio");
  return { title: t("title") };
}

export default async function PortfolioPage() {
  const t = await getTranslations("portfolio");
  return (
    <div className={PAGE}>
      <PageHeader face="blue" kicker={t("kicker")} title={t("title")} lede={t("lede")} />
      <div className="mt-12">
        <PortfolioView />
      </div>
    </div>
  );
}
