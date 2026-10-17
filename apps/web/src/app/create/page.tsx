import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CreateForm } from "@/components/create/CreateForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("create");
  return { title: t("metaTitle") };
}

export default async function CreatePage() {
  const t = await getTranslations("create");
  return (
    <div className="gutter mx-auto max-w-[1280px] pt-10 lg:pt-14">
      <h1 className="display-tight text-3xl font-extrabold sm:text-4xl">{t("title")}</h1>
      <p className="mt-3 max-w-[60ch] text-md text-ink-2">{t("lede")}</p>
      <div className="mt-10">
        <CreateForm />
      </div>
    </div>
  );
}
