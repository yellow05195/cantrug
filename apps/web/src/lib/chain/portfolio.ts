/**
 * Every FLOORED coin a wallet holds, read from the chain: token accounts →
 * coin PDAs that exist under the program → CoinState + mint supply + queue entry.
 */
import {
  PROGRAM_ID,
  coinPda,
  decodeCoinState,
  decodeQueueEntry,
  queueEntryPda,
  queueEntryStatus,
  type CoinState,
  type QueueEntryStatus,
} from "@floored/sdk";
import { MintLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, type AccountInfo } from "@solana/web3.js";
import { ENV } from "@/lib/env";
import { connection } from "./reads";

export interface Position {
  mint: string;
  state: CoinState;
  supply: bigint;
  balance: bigint;
  queue: QueueEntryStatus | null;
}

async function many(keys: PublicKey[]): Promise<(AccountInfo<Buffer> | null)[]> {
  const out: (AccountInfo<Buffer> | null)[] = [];
  for (let i = 0; i < keys.length; i += 100) out.push(...(await connection().getMultipleAccountsInfo(keys.slice(i, i + 100))));
  return out;
}

export async function readPositions(ownerStr: string): Promise<Position[]> {
  if (ENV.mock) {
    const [{ dataset }, { cloneState }] = await Promise.all([import("@/lib/mock/api"), import("@/lib/mock/engine")]);
    const { mockReadUser } = await import("./mockChain");
    return dataset()
      .coins.filter((c) => (c.holders.get(ownerStr) ?? 0n) > 0n || c.positions.has(ownerStr))
      .map((c) => {
        const mint = c.state.mint.toBase58();
        return { mint, state: cloneState(c.state), supply: c.supply, balance: c.holders.get(ownerStr) ?? 0n, queue: mockReadUser(mint, ownerStr).queue };
      });
  }
  const owner = new PublicKey(ownerStr);
  const res = await connection().getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID });
  const holdings = res.value
    .map((a) => {
      const info = (a.account.data as { parsed: { info: { mint: string; tokenAmount: { amount: string } } } }).parsed.info;
      return { mint: info.mint, amount: BigInt(info.tokenAmount.amount) };
    })
    .filter((h) => h.amount > 0n);
  if (!holdings.length) return [];
  const mints = holdings.map((h) => new PublicKey(h.mint));
  const coins = mints.map((m) => coinPda(m));
  const coinInfos = await many(coins);
  const found = holdings
    .map((h, i) => ({ h, i, info: coinInfos[i] }))
    .filter((x) => x.info && x.info.owner.equals(PROGRAM_ID));
  if (!found.length) return [];
  const [mintInfos, qeInfos] = await Promise.all([many(found.map((x) => mints[x.i]!)), many(found.map((x) => queueEntryPda(coins[x.i]!, owner)))]);
  return found.map((x, j) => {
    const state = decodeCoinState(new Uint8Array(x.info!.data));
    const supply = mintInfos[j] ? BigInt(MintLayout.decode(mintInfos[j]!.data).supply.toString()) : 0n;
    let queue: QueueEntryStatus | null = null;
    const qi = qeInfos[j];
    if (qi) {
      try {
        const entry = decodeQueueEntry(new Uint8Array(qi.data));
        queue = entry.epoch === state.brake.epoch ? queueEntryStatus(entry, state) : { remaining: 0n, owed: 0n, stale: true };
      } catch {
        queue = null;
      }
    }
    return { mint: x.h.mint, state, supply, balance: x.h.amount, queue };
  });
}
