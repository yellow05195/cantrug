/** Mock-mode stand-in for the RPC reads, served from the in-tab dataset. */
import { queueEntryStatus, type EpochRecord, type QueueEntry } from "@floored/sdk";
import { PublicKey } from "@solana/web3.js";
import { dataset } from "@/lib/mock/api";
import { cloneState, slotAt } from "@/lib/mock/engine";
import type { CoinChain, UserChain } from "./reads";

export function mockReadCoin(mint: string): CoinChain | null {
  const c = dataset().byMint.get(mint);
  if (!c) return null;
  const now = Date.now();
  return { state: cloneState(c.state), supply: c.supply, slot: slotAt(now), readAt: now };
}

export function mockReadUser(mint: string, owner: string): UserChain {
  const c = dataset().byMint.get(mint);
  const lamports = 42_000_000_000n;
  if (!c) return { owner, balance: 0n, lamports, queueEntry: null, epochRecord: null, queue: null };
  const balance = c.holders.get(owner) ?? 0n;
  const e = c.positions.get(owner);
  let queueEntry: QueueEntry | null = null;
  let epochRecord: EpochRecord | null = null;
  if (e) {
    queueEntry = {
      coin: c.state.mint,
      owner: new PublicKey(owner),
      epoch: e.pos.epoch,
      shares: e.pos.shares,
      solIndexAtJoin: e.pos.solIndexAtJoin,
      joinedSlot: e.joinedSlot,
      amountQueued: e.amountQueued,
      bump: 255,
    };
    if (e.pos.epoch !== c.state.brake.epoch) {
      epochRecord = { coin: c.state.mint, epoch: e.pos.epoch, closed: true, finalSolIndex: c.epochRecords.get(e.pos.epoch) ?? 0n, bump: 255 };
    }
  }
  let queue = null;
  if (queueEntry) {
    try {
      queue = queueEntryStatus(queueEntry, c.state, epochRecord);
    } catch {
      queue = null;
    }
  }
  return { owner, balance, lamports, queueEntry, epochRecord, queue };
}
