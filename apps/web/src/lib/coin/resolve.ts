import { api, safely } from "@/lib/api/client";
import type { CoinJson } from "@/lib/api/types";
import { coinJsonFromChain } from "@/lib/chain/fromChain";
import { isPubkey, readCoin, readTokenMeta } from "@/lib/chain/reads";
import { ENV } from "@/lib/env";

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

/** A coin row from the indexer (or mock), else rebuilt from RPC reads. Server side, for metadata and OG. */
export async function resolveCoin(mint: string, opts: { chainFallback?: boolean } = {}): Promise<CoinJson | null> {
  if (!isPubkey(mint)) return null;
  const row = await safely(api.coin(mint), null);
  if (row || ENV.mock || opts.chainFallback === false) return row;
  const chain = await withTimeout(readCoin(mint), 5000, null);
  if (!chain) return null;
  const meta = await withTimeout(readTokenMeta(mint), 3000, null);
  return coinJsonFromChain(chain, meta);
}
