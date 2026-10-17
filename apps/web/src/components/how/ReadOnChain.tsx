"use client";
import { circulatingSupply, coinFloorQ64, coinKeys, formatSolPerToken } from "@floored/sdk";
import { PublicKey } from "@solana/web3.js";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { isPubkey, readCoin, type CoinChain } from "@/lib/chain/reads";
import { ENV, explorerAddress } from "@/lib/env";
import { shortAddress, sol, tokens } from "@/lib/format";

/** Fetch any coin's live state from the RPC and recompute the floor in the browser. */
export function ReadOnChain() {
  const t = useTranslations("how.verify");
  const [mint, setMint] = useState(ENV.challengeMint);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ chain: CoinChain; source: "rpc" | "mock" } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const go = async () => {
    setErr(null);
    setRes(null);
    if (!isPubkey(mint.trim())) {
      setErr(t("badMint"));
      return;
    }
    setBusy(true);
    try {
      let chain = await readCoin(mint.trim()).catch(() => null);
      let source: "rpc" | "mock" = "rpc";
      if (!chain && ENV.mock) {
        const { mockReadCoin } = await import("@/lib/chain/mockChain");
        chain = mockReadCoin(mint.trim());
        source = "mock";
      }
      if (!chain) setErr(t("notFound", { cluster: ENV.cluster }));
      else setRes({ chain, source });
    } finally {
      setBusy(false);
    }
  };

  const s = res?.chain.state;
  const keys = s ? coinKeys(new PublicKey(mint.trim())) : null;
  const c = s && res ? circulatingSupply(s, res.chain.supply) : 0n;

  return (
    <div className="not-prose my-8 sticker p-4">
      <label htmlFor="roc-mint" className="text-sm text-ink-2">
        {t("label")}
      </label>
      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
        <input
          id="roc-mint"
          value={mint}
          onChange={(e) => setMint(e.target.value)}
          spellCheck={false}
          className="num h-10 min-w-0 flex-1 rounded-lg border border-stroke bg-bg-3 px-3 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-floor"
        />
        <Button variant="primary" onClick={() => void go()} loading={busy}>
          {t("read")}
        </Button>
      </div>
      {err ? <p className="mt-3 text-sm text-down">{err}</p> : null}
      {s && res && keys ? (
        <div className="mt-4 space-y-3 text-sm">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Row k="S, pool SOL" v={`${sol(s.poolSol)} SOL`} />
            <Row k="supply" v={tokens(res.chain.supply)} />
            <Row k="T, pool tokens" v={tokens(s.poolTok)} />
            <Row k="Q, queued" v={tokens(s.brake.queuedTotal)} />
            <Row k="C = supply − T − Q" v={tokens(c)} />
            <Row k="floor = S / C" v={s.phase === 1 ? `${formatSolPerToken(coinFloorQ64(s, res.chain.supply), 6)} SOL` : t("curve")} floor />
          </dl>
          <div className="border-t border-line pt-3 text-xs text-ink-3">
            <p>{res.source === "mock" ? t("sourceMock") : t("sourceRpc", { rpc: ENV.rpcUrl })}</p>
            <p className="mt-1">
              {t("accounts")}{" "}
              {[
                ["CoinState", keys.coin],
                ["pool SOL vault", keys.poolSolVault],
                ["mint", keys.mint],
              ].map(([label, k], i) => (
                <span key={String(label)}>
                  {i ? ", " : ""}
                  <a href={explorerAddress((k as PublicKey).toBase58())} target="_blank" rel="noreferrer" className="num text-ink-2 hover:text-ink">
                    {String(label)} {shortAddress(k as PublicKey)}
                  </a>
                </span>
              ))}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ k, v, floor }: { k: string; v: string; floor?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line/60 pb-1.5">
      <dt className="num text-ink-3">{k}</dt>
      <dd className={floor ? "num text-floor" : "num"}>{v}</dd>
    </div>
  );
}
