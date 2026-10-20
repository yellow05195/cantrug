import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CreateForm } from "@/components/create/CreateForm";
import { PAGE, PageHeader } from "@/components/ui/PageHeader";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("create");
  return { title: t("metaTitle") };
}

export default async function CreatePage() {
  const t = await getTranslations("create");
  return (
    <div className={PAGE}>
      <PageHeader face="orange" kicker={t("kicker")} title={t("title")} lede={t("lede")} />
      <div className="mt-12">
        <CreateForm />
      </div>
    </div>
  );
}
