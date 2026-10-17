/**
 * Optional holders refresher (HOLDERS_REFRESH_INTERVAL_MS > 0).
 *
 * Strategy per coin:
 *  1. `getProgramAccounts(Token program, dataSize = 165, memcmp(mint) at 0)`
 *     with a 40-byte dataSlice (owner + amount): every holder, exact.
 *  2. If the RPC refuses (many public/free endpoints disable or throttle
 *     getProgramAccounts on the Token program), fall back to
 *     `getTokenLargestAccounts` (top 20 accounts only) + their owners.
 *
 * Accounts owned by the coin PDA (curve vault, pool vault, queue escrow) are
 * excluded. The webhook path never depends on this job.
 *
 * Rate limits: one coin at a time with a pause between coins; on a free RPC,
 * keep HOLDERS_REFRESH_MAX_COINS small and the interval at several minutes.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import type { Logger } from "pino";
import type { MaintenanceStore } from "../repo/types.js";

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

export function aggregateHolders(accounts: { owner: string; amount: bigint }[], exclude: Set<string>): { owner: string; balance: bigint }[] {
  const m = new Map<string, bigint>();
  for (const a of accounts) {
    if (exclude.has(a.owner) || a.amount === 0n) continue;
    m.set(a.owner, (m.get(a.owner) ?? 0n) + a.amount);
  }
  return [...m.entries()].map(([owner, balance]) => ({ owner, balance })).sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));
}

function readU64LE(b: Uint8Array, off: number): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(b[off + i]!);
  return v;
}

export async function fetchHolders(conn: Connection, mint: string, coinPda: string): Promise<{ rows: { owner: string; balance: bigint }[]; complete: boolean }> {
  const exclude = new Set([coinPda]);
  try {
    const accs = await conn.getProgramAccounts(TOKEN_PROGRAM_ID, {
      commitment: "confirmed",
      dataSlice: { offset: 32, length: 40 },
      filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint } }],
    });
    const list = accs.map((a) => {
      const d = a.account.data;
      return { owner: new PublicKey(d.subarray(0, 32)).toBase58(), amount: readU64LE(d, 32) };
    });
    return { rows: aggregateHolders(list, exclude), complete: true };
  } catch {
    const largest = await conn.getTokenLargestAccounts(new PublicKey(mint), "confirmed");
    const infos = await conn.getMultipleParsedAccounts(largest.value.map((v) => v.address), { commitment: "confirmed" });
    const list: { owner: string; amount: bigint }[] = [];
    largest.value.forEach((v, i) => {
      const info = infos.value[i];
      const data = info?.data;
      if (data && typeof data === "object" && "parsed" in data) {
        const owner = (data.parsed as { info?: { owner?: string } }).info?.owner;
        if (owner) list.push({ owner, amount: BigInt(v.amount) });
      }
    });
    return { rows: aggregateHolders(list, exclude), complete: false };
  }
}

export function startHoldersJob(opts: {
  store: MaintenanceStore;
  rpcUrl: string;
  intervalMs: number;
  maxCoins: number;
  log: Logger;
  pauseMs?: number;
}): () => void {
  const conn = new Connection(opts.rpcUrl, "confirmed");
  let stopped = false;
  let busy = false;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      const mints = await opts.store.listMintsForHolderRefresh(opts.maxCoins);
      for (const { mint, coin } of mints) {
        if (stopped) break;
        try {
          const { rows, complete } = await fetchHolders(conn, mint, coin);
          await opts.store.replaceHolders(mint, rows, new Date());
          opts.log.debug({ mint, holders: rows.length, complete }, "holders refreshed");
        } catch (err) {
          opts.log.warn({ err, mint }, "holders refresh failed");
        }
        await new Promise((r) => setTimeout(r, opts.pauseMs ?? 1_500));
      }
    } catch (err) {
      opts.log.error({ err }, "holders job failed");
    } finally {
      busy = false;
    }
  };
  const t = setInterval(() => void tick(), opts.intervalMs);
  t.unref?.();
  void tick();
  return () => {
    stopped = true;
    clearInterval(t);
  };
}
