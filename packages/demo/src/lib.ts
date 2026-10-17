import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  coinKeys,
  configPda,
  decodeCoinState,
  decodeGlobalConfig,
  decodeQueueEntry,
  formatSol,
  formatTokens,
  queueEntryPda,
  setComputeUnitLimit,
  parseEvents,
  type CoinState,
} from "@floored/sdk";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
export const RPC = process.env.RPC_URL ?? "https://api.devnet.solana.com";
export const connection = new Connection(RPC, "confirmed");
export const STATE_FILE = join(ROOT, "packages", "demo", ".demo-state.json");

export function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
}

/** The devnet deployer / config authority (gitignored). */
export const deployer = loadKeypair(process.env.DEPLOYER ?? join(ROOT, "keys", "floored-devnet.json"));

export interface DemoState {
  mint?: string;
  creator?: string;
  buyers?: string[];
  dev?: string;
  signatures: Record<string, string[]>;
}

export function loadState(): DemoState {
  if (!existsSync(STATE_FILE)) return { signatures: {} };
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}
export function saveState(s: DemoState): void {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

/** Deterministic throw-away wallets for the demo, funded from the deployer. */
export function demoWallet(label: string): Keypair {
  const seed = new TextEncoder().encode(`floored-demo:${label}:${deployer.publicKey.toBase58()}`.padEnd(32, "#")).slice(0, 32);
  return Keypair.fromSeed(seed);
}

export async function ensureFunded(k: Keypair, sol: number): Promise<void> {
  const bal = await connection.getBalance(k.publicKey);
  const want = Math.round(sol * LAMPORTS_PER_SOL);
  if (bal >= want) return;
  const { SystemProgram } = await import("@solana/web3.js");
  await send([SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: k.publicKey, lamports: want - bal })], [deployer], "fund " + k.publicKey.toBase58().slice(0, 6));
}

export async function send(ixs: TransactionInstruction[], signers: Keypair[], label: string, cu = 400_000): Promise<string> {
  const tx = new Transaction().add(setComputeUnitLimit(cu), ...ixs);
  tx.feePayer = signers[0].publicKey;
  const sig = await sendAndConfirmTransaction(connection, tx, signers, { commitment: "confirmed", skipPreflight: false });
  const t = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  const events = parseEvents(t?.meta?.logMessages ?? []);
  console.log(`✔ ${label}  ${sig}`);
  for (const e of events) console.log(`   event ${e.name}`, summarize(e.data as unknown as Record<string, unknown>));
  return sig;
}

function summarize(d: Record<string, unknown>): string {
  const keys = ["solAmount", "tokenAmount", "solOut", "tokensBurned", "poolSol", "poolTok", "queued", "queuedRemainder", "sold", "closedEpoch", "sol_amount", "token_amount", "sol_out", "pool_sol", "pool_tok", "queued_remainder"];
  return Object.entries(d)
    .filter(([k]) => keys.includes(k))
    .map(([k, v]) => `${k}=${typeof v === "bigint" ? v.toString() : String(v)}`)
    .join(" ");
}

export async function coinState(mint: PublicKey): Promise<CoinState> {
  const info = await connection.getAccountInfo(coinKeys(mint).coin);
  if (!info) throw new Error("coin not found");
  return decodeCoinState(new Uint8Array(info.data));
}

export async function supplyOf(mint: PublicKey): Promise<bigint> {
  const s = await connection.getTokenSupply(mint);
  return BigInt(s.value.amount);
}

export async function tokenBalance(owner: PublicKey, mint: PublicKey): Promise<bigint> {
  const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
  const ata = getAssociatedTokenAddressSync(mint, owner);
  try {
    const b = await connection.getTokenAccountBalance(ata);
    return BigInt(b.value.amount);
  } catch {
    return 0n;
  }
}

export async function queueEntry(mint: PublicKey, owner: PublicKey) {
  const info = await connection.getAccountInfo(queueEntryPda(coinKeys(mint).coin, owner));
  if (!info || info.data.length === 0) return null;
  return decodeQueueEntry(new Uint8Array(info.data));
}

export async function config() {
  const info = await connection.getAccountInfo(configPda());
  return info ? decodeGlobalConfig(new Uint8Array(info.data)) : null;
}

export async function slot(): Promise<bigint> {
  return BigInt(await connection.getSlot("confirmed"));
}

/** Print the floor exactly as a holder would compute it from three reads. */
export async function printFloor(mint: PublicKey, tag: string): Promise<void> {
  const k = coinKeys(mint);
  const c = await coinState(mint);
  const supply = await supplyOf(mint);
  const vault = await connection.getBalance(k.poolSolVault);
  const rent = await connection.getMinimumBalanceForRentExemption(0);
  const tokVault = await connection.getTokenAccountBalance(k.poolTokenVault).then((b) => BigInt(b.value.amount)).catch(() => 0n);
  const S = BigInt(vault - rent);
  const T = tokVault;
  const Q = c.brake.queuedTotal;
  const C = supply - T - Q;
  const floorLamportsPerToken = C > 0n ? Number(S) / (Number(C) / 1e6) : 0;
  const price = T > 0n ? Number(S) / (Number(T) / 1e6) : 0;
  console.log(`\n[${tag}] phase=${c.phase === 0 ? "curve" : "graduated"}`);
  console.log(`   S (pool_sol_vault − rent) = ${formatSol(S)} SOL   (state says ${formatSol(c.poolSol)})`);
  console.log(`   T (pool_token_vault)      = ${formatTokens(T)} tokens   (state says ${formatTokens(c.poolTok)})`);
  console.log(`   Q (queued)                = ${formatTokens(Q)} tokens`);
  console.log(`   C = supply − T − Q        = ${formatTokens(C)} tokens`);
  if (c.phase === 1) {
    console.log(`   floor = S / C             = ${(floorLamportsPerToken / 1e9).toExponential(4)} SOL per token`);
    console.log(`   price = S / T             = ${(price / 1e9).toExponential(4)} SOL per token  (${price > 0 ? ((price / floorLamportsPerToken - 1) * 100).toFixed(1) : "0"} % above the floor)`);
  } else {
    console.log(`   curve: real_sol=${formatSol(c.realSol)} SOL sold=${formatTokens(c.tokensSold)}  floor preview = ${c.tokensSold > 0n ? (Number(c.realSol) / (Number(c.tokensSold) / 1e6) / 1e9).toExponential(4) : "n/a"} SOL per token (active at graduation)`);
  }
}

export { LAMPORTS_PER_SOL, PublicKey, Keypair };
