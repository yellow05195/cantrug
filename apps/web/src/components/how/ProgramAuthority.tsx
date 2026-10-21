import { PublicKey } from "@solana/web3.js";
import { getTranslations } from "next-intl/server";
import { ENV, explorerAddress } from "@/lib/env";
import { serverConnection } from "@/lib/server/rpc";

const LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

/** Who can change the program: read from its ProgramData account at request time. */
async function upgradeAuthority(): Promise<{ ok: true; authority: string | null } | { ok: false }> {
  try {
    const program = new PublicKey(ENV.programId);
    const [programData] = PublicKey.findProgramAddressSync([program.toBuffer()], LOADER);
    const info = await serverConnection().getAccountInfo(programData, { dataSlice: { offset: 12, length: 33 } });
    if (!info) return { ok: false };
    const d = info.data;
    return { ok: true, authority: d[0] === 1 ? new PublicKey(d.subarray(1, 33)).toBase58() : null };
  } catch {
    return { ok: false };
  }
}

export async function ProgramAuthority() {
  const t = await getTranslations("how.verify.authority");
  const r = await upgradeAuthority();
  const immutable = r.ok && r.authority === null;
  return (
    <div className="patch-card my-8 p-6">
      <p className="kicker">{t("kicker")}</p>
      <p className={`mt-2 font-display text-xl font-semibold ${immutable ? "text-cube-green" : "text-ink"}`}>
        {!r.ok ? t("unknown") : immutable ? t("immutable") : t("upgradeable")}
      </p>
      <p className="mt-2 text-md text-ink-2">
        {!r.ok ? t("unknownBody") : immutable ? t("immutableBody") : t("upgradeableBody", { authority: r.authority! })}
      </p>
      <a href={explorerAddress(ENV.programId)} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm text-ink-2 underline decoration-line-2 underline-offset-4 hover:text-ink">
        {t("check")}
      </a>
    </div>
  );
}
