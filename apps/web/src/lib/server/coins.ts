/**
 * Every FLOORED coin, read from the program's accounts (getProgramAccounts on
 * CoinState) plus mint supplies and Metaplex metadata, serialized exactly like
 * the indexer's /api/coins rows. Lists are memoized a few seconds per instance;
 * the route handlers add CDN caching on top.
 */
import { ACCOUNT_DISCRIMINATORS, ACCOUNT_SIZES, PROGRAM_ID, decodeCoinState, type CoinState } from "@floored/sdk";
import { MintLayout } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import type { CoinJson, CoinListJson, Phase, SortKey } from "@/lib/api/types";
import { coinJsonFromChain } from "@/lib/chain/fromChain";
import { readCoin, readConfig, readTokenMeta, type TokenMeta } from "@/lib/chain/reads";
import { memo } from "./memo";
import { mapLimit, serverConnection } from "./rpc";

export interface CoinAccount {
  state: CoinState;
  mint: string;
}

/** All CoinState accounts of the program. */
export function coinStates(): Promise<CoinAccount[]> {
  return memo(
    "coins:states",
    async () => {
      const c = serverConnection();
      const accounts = await c.getProgramAccounts(PROGRAM_ID, {
        commitment: "confirmed",
        filters: [
          { dataSize: ACCOUNT_SIZES.CoinState },
          { memcmp: { offset: 0, bytes: Buffer.from(ACCOUNT_DISCRIMINATORS.CoinState).toString("base64"), encoding: "base64" } },
        ],
      });
      const out: CoinAccount[] = [];
      for (const a of accounts) {
        try {
          const state = decodeCoinState(new Uint8Array(a.account.data));
          out.push({ state, mint: state.mint.toBase58() });
        } catch {
          /* foreign or corrupt account: skip */
        }
      }
      return out;
    },
    { fresh: 5000, stale: 60_000 },
  );
}

async function supplies(mints: string[]): Promise<Map<string, bigint>> {
  const c = serverConnection();
  const keys = mints.map((m) => new PublicKey(m));
  const out = new Map<string, bigint>();
  const chunks: PublicKey[][] = [];
  for (let i = 0; i < keys.length; i += 100) chunks.push(keys.slice(i, i + 100));
  const infos = await mapLimit(chunks, 4, (chunk) => c.getMultipleAccountsInfo(chunk));
  infos.flat().forEach((info, i) => {
    if (info && info.data.length >= MintLayout.span) out.set(mints[i]!, BigInt(MintLayout.decode(info.data).supply.toString()));
  });
  return out;
}

/** Metaplex metadata + its JSON (image, description, socials), cached 10 minutes. */
export function tokenMeta(mint: string): Promise<TokenMeta | null> {
  return memo(`meta:${mint}`, () => readTokenMeta(mint, serverConnection()), { fresh: 600_000, stale: 3_600_000 });
}

export function currentSlot(): Promise<number> {
  return memo("slot", () => serverConnection().getSlot("confirmed"), { fresh: 2000, stale: 20_000 });
}

/** Every coin as a CoinJson row (no history-derived fields: holders and 24 h volume stay null). */
export function coinRows(): Promise<CoinJson[]> {
  return memo(
    "coins:rows",
    async () => {
      const [states, slot] = await Promise.all([coinStates(), currentSlot()]);
      const mints = states.map((s) => s.mint);
      const [sup, metas] = await Promise.all([supplies(mints), mapLimit(mints, 8, (m) => tokenMeta(m).catch(() => null))]);
      const readAt = Date.now();
      return states.map((s, i) =>
        coinJsonFromChain({ state: s.state, supply: sup.get(s.mint) ?? 1_000_000_000_000_000n, slot: BigInt(slot), readAt }, metas[i] ?? null),
      );
    },
    { fresh: 5000, stale: 60_000 },
  );
}

const num = (s: string | undefined) => Number(s ?? "0");

export function sortRows(rows: CoinJson[], sort: SortKey): CoinJson[] {
  const r = [...rows];
  switch (sort) {
    case "graduating":
      return r.sort((a, b) => (b.graduation_progress_bps ?? 0) - (a.graduation_progress_bps ?? 0) || (b.created_slot ?? 0) - (a.created_slot ?? 0));
    case "floor":
      return r.sort((a, b) => (b.floor?.display ?? b.floor_preview?.display ?? 0) - (a.floor?.display ?? a.floor_preview?.display ?? 0));
    case "volume":
      return r.sort((a, b) => num(b.volume_sol) - num(a.volume_sol));
    case "new":
    default:
      return r.sort((a, b) => (b.created_slot ?? 0) - (a.created_slot ?? 0));
  }
}

export async function listCoins(q: { sort?: SortKey; phase?: Phase; limit?: number; cursor?: string }): Promise<CoinListJson> {
  const limit = Math.min(100, Math.max(1, q.limit ?? 50));
  const offset = q.cursor && /^\d+$/.test(q.cursor) ? Number(q.cursor) : 0;
  let rows = await coinRows();
  if (q.phase) rows = rows.filter((r) => r.phase === q.phase);
  rows = sortRows(rows, q.sort ?? "new");
  const items = rows.slice(offset, offset + limit);
  return { items, next_cursor: offset + limit < rows.length ? String(offset + limit) : null };
}

/** One coin, from a direct read (fresh), with its metadata. */
export function getCoin(mint: string): Promise<CoinJson | null> {
  return memo(
    `coin:${mint}`,
    async () => {
      const [chain, meta] = await Promise.all([readCoin(mint, serverConnection()), tokenMeta(mint).catch(() => null)]);
      return chain ? coinJsonFromChain(chain, meta) : null;
    },
    { fresh: 2500, stale: 30_000 },
  );
}

export function globalConfig() {
  return memo("config", () => readConfig(serverConnection()), { fresh: 5000, stale: 60_000 });
}
