/**
 * Direct RPC reads. The coin page's quotes and "your bag is worth at least"
 * come from here, never from the indexer.
 */
import {
  ACCOUNT_SIZES,
  PROGRAM_ID,
  coinKeys,
  configPda,
  decodeCoinState,
  decodeEpochRecord,
  decodeGlobalConfig,
  decodeQueueEntry,
  epochRecordPda,
  metadataPda,
  queueEntryPda,
  queueEntryStatus,
  userTokenAccount,
  type CoinState,
  type EpochRecord,
  type GlobalConfig,
  type QueueEntry,
  type QueueEntryStatus,
} from "@floored/sdk";
import { AccountLayout, MintLayout } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { ENV } from "@/lib/env";

let conn: Connection | null = null;
export function connection(): Connection {
  if (!conn) conn = new Connection(ENV.rpcUrl, { commitment: "confirmed" });
  return conn;
}

export interface CoinChain {
  state: CoinState;
  /** Mint supply (base units). */
  supply: bigint;
  slot: bigint;
  /** Unix ms when read. */
  readAt: number;
}

export interface UserChain {
  owner: string;
  /** Token balance in the ATA (base units). */
  balance: bigint;
  /** Wallet SOL balance (lamports). */
  lamports: bigint;
  queueEntry: QueueEntry | null;
  epochRecord: EpochRecord | null;
  queue: QueueEntryStatus | null;
}

export function isPubkey(s: string): boolean {
  try {
    new PublicKey(s);
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
  } catch {
    return false;
  }
}

export async function readCoin(mintStr: string, c: Connection = connection()): Promise<CoinChain | null> {
  const mint = new PublicKey(mintStr);
  const k = coinKeys(mint);
  const [infos, slot] = await Promise.all([c.getMultipleAccountsInfo([k.coin, mint]), c.getSlot()]);
  const [coinInfo, mintInfo] = infos;
  if (!coinInfo || !coinInfo.owner.equals(PROGRAM_ID) || !mintInfo) return null;
  const state = decodeCoinState(new Uint8Array(coinInfo.data));
  const supply = BigInt(MintLayout.decode(mintInfo.data).supply.toString());
  return { state, supply, slot: BigInt(slot), readAt: Date.now() };
}

export async function readUser(mintStr: string, ownerStr: string, state: CoinState, c: Connection = connection()): Promise<UserChain> {
  const mint = new PublicKey(mintStr);
  const owner = new PublicKey(ownerStr);
  const k = coinKeys(mint);
  const ata = userTokenAccount(owner, mint);
  const qe = queueEntryPda(k.coin, owner);
  const [ownerInfo, ataInfo, qeInfo] = await c.getMultipleAccountsInfo([owner, ata, qe]);
  const balance = ataInfo && ataInfo.data.length >= 165 ? BigInt(AccountLayout.decode(ataInfo.data).amount.toString()) : 0n;
  const queueEntry = qeInfo && qeInfo.data.length >= ACCOUNT_SIZES.QueueEntry ? decodeQueueEntry(new Uint8Array(qeInfo.data)) : null;
  let epochRecord: EpochRecord | null = null;
  let queue: QueueEntryStatus | null = null;
  if (queueEntry) {
    if (queueEntry.epoch !== state.brake.epoch) {
      const er = await c.getAccountInfo(epochRecordPda(k.coin, queueEntry.epoch));
      epochRecord = er ? decodeEpochRecord(new Uint8Array(er.data)) : null;
    }
    try {
      queue = queueEntryStatus(queueEntry, state, epochRecord);
    } catch {
      queue = null;
    }
  }
  return { owner: ownerStr, balance, lamports: BigInt(ownerInfo?.lamports ?? 0), queueEntry, epochRecord, queue };
}

export async function readConfig(c: Connection = connection()): Promise<GlobalConfig | null> {
  const info = await c.getAccountInfo(configPda());
  return info ? decodeGlobalConfig(new Uint8Array(info.data)) : null;
}

export interface TokenMeta {
  name: string;
  symbol: string;
  uri: string;
  image: string | null;
  description: string | null;
  socials: { website?: string; x?: string; telegram?: string };
}

function readBorshString(buf: Uint8Array, off: number): [string, number] {
  const len = buf[off]! | (buf[off + 1]! << 8) | (buf[off + 2]! << 16) | (buf[off + 3]! << 24);
  const s = new TextDecoder().decode(buf.subarray(off + 4, off + 4 + len)).replace(/\0+$/, "").trim();
  return [s, off + 4 + len];
}

/** Metaplex metadata: key u8, update authority, mint, then name / symbol / uri as Borsh strings. */
export async function readTokenMeta(mintStr: string, c: Connection = connection()): Promise<TokenMeta | null> {
  const info = await c.getAccountInfo(metadataPda(new PublicKey(mintStr)));
  if (!info) return null;
  const d = new Uint8Array(info.data);
  let off = 1 + 32 + 32;
  const [name, o1] = readBorshString(d, off);
  off = o1;
  const [symbol, o2] = readBorshString(d, off);
  off = o2;
  const [uri] = readBorshString(d, off);
  const meta: TokenMeta = { name, symbol, uri, image: null, description: null, socials: {} };
  if (/^https?:\/\//.test(uri) || uri.startsWith("data:application/json")) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(uri, { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) {
        const j = (await res.json()) as Record<string, unknown>;
        if (typeof j.image === "string") meta.image = j.image;
        if (typeof j.description === "string") meta.description = j.description;
        const ext = (j.extensions ?? j) as Record<string, unknown>;
        if (typeof ext.website === "string") meta.socials.website = ext.website;
        if (typeof ext.twitter === "string") meta.socials.x = ext.twitter;
        if (typeof ext.x === "string") meta.socials.x = ext.x;
        if (typeof ext.telegram === "string") meta.socials.telegram = ext.telegram;
      }
    } catch {
      /* metadata JSON unreachable: keep on-chain name and symbol */
    }
  }
  return meta;
}
