import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ChallengeReplay } from "@/components/challenge/ChallengeReplay";
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
    <div className="gutter mx-auto max-w-[1280px] pt-10 lg:pt-14">
      <div className="max-w-[62ch]">
        <h1 className="display-tight text-4xl font-extrabold leading-[1.05] sm:text-5xl">{t("title")}</h1>
        <p className="mt-5 text-lg text-ink-2">{t("lede")}</p>
        <p className="mt-3 text-sm text-ink-3">
          {t("subject", { name: coin?.name ?? "Floored Demo", symbol: coin?.symbol ?? "FLRD", dev: shortAddress(ENV.challengeDev) })}
        </p>
      </div>
      <div className="mt-10">
        <ChallengeReplay coin={coin} mint={mint} dev={ENV.challengeDev} />
      </div>
    </div>
  );
}
