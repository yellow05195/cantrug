import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ChallengeReplay } from "@/components/challenge/ChallengeReplay";
import { PAGE, PageHeader } from "@/components/ui/PageHeader";
import { resolveCoin } from "@/lib/coin/resolve";
import { ENV } from "@/lib/env";
import { shortAddress } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("challenge");
  return { title: t("title"), description: t("lede") };
}

export default async function ChallengePage() {
  const t = await getTranslations("challenge");
  const mint = ENV.challengeMint;
  const coin = await resolveCoin(mint);
  return (
    <div className={PAGE}>
      <PageHeader face="red" kicker={t("kicker")} title={t("title")} lede={t("lede")}>
        <p className="mt-3 text-sm opacity-75">
          {t("subject", { name: coin?.name ?? "Floored Demo", symbol: coin?.symbol ?? "FLRD", dev: shortAddress(ENV.challengeDev) })}
        </p>
      </PageHeader>
      <div className="mt-12">
        <ChallengeReplay coin={coin} mint={mint} dev={ENV.challengeDev} />
      </div>
    </div>
  );
}
