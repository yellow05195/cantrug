/**
 * Program addresses. Seeds mirror `programs/floored/src/state.rs` (SEED_*)
 * and `tests-rs/src/lib.rs` (CoinKeys).
 */
import { Buffer } from "buffer";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, ComputeBudgetProgram } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";

export const PROGRAM_ID = new PublicKey("E7ZbamLD8wenjjHitR8bUHwuNKA4Em39sqybnhk3nc87");
export const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
export const SYSTEM_PROGRAM_ID = SystemProgram.programId;
export const RENT_SYSVAR_ID = SYSVAR_RENT_PUBKEY;
export const COMPUTE_BUDGET_PROGRAM_ID = ComputeBudgetProgram.programId;
export { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID };

/** Seeds, byte-for-byte the `SEED_*` constants of state.rs. */
export const SEEDS = Object.freeze({
  config: "config",
  coin: "coin",
  curveVault: "curve_sol",
  floorReserve: "floor_reserve",
  poolSol: "pool_sol",
  feeVault: "fees",
  queueSol: "queue_sol",
  curveTokens: "curve_tokens",
  poolTokens: "pool_tokens",
  queueEscrow: "queue_escrow",
  queueEntry: "queue",
  epoch: "epoch",
  metadata: "metadata",
} as const);

const seed = (s: string) => Buffer.from(s, "utf8");

/** `find_program_address` under the FLOORED program. Returns `[address, bump]`. */
export function findPda(seeds: (Buffer | Uint8Array)[], programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

function pda(seeds: (Buffer | Uint8Array)[]): PublicKey {
  return findPda(seeds)[0];
}

/** u32 little-endian, as `epoch.to_le_bytes()` in Rust. */
export function u32le(n: number): Buffer {
  if (!Number.isInteger(n) || n < 0 || n > 0xffff_ffff) throw new RangeError(`not a u32: ${n}`);
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

export function configPda(): PublicKey {
  return pda([seed(SEEDS.config)]);
}
export function coinPda(mint: PublicKey): PublicKey {
  return pda([seed(SEEDS.coin), mint.toBuffer()]);
}
export function curveVaultPda(coin: PublicKey): PublicKey {
  return pda([seed(SEEDS.curveVault), coin.toBuffer()]);
}
export function floorReservePda(coin: PublicKey): PublicKey {
  return pda([seed(SEEDS.floorReserve), coin.toBuffer()]);
}
export function poolSolVaultPda(coin: PublicKey): PublicKey {
  return pda([seed(SEEDS.poolSol), coin.toBuffer()]);
}
export function feeVaultPda(coin: PublicKey): PublicKey {
  return pda([seed(SEEDS.feeVault), coin.toBuffer()]);
}
export function queueSolVaultPda(coin: PublicKey): PublicKey {
  return pda([seed(SEEDS.queueSol), coin.toBuffer()]);
}
export function curveTokenVaultPda(coin: PublicKey): PublicKey {
  return pda([seed(SEEDS.curveTokens), coin.toBuffer()]);
}
export function poolTokenVaultPda(coin: PublicKey): PublicKey {
  return pda([seed(SEEDS.poolTokens), coin.toBuffer()]);
}
export function queueEscrowPda(coin: PublicKey): PublicKey {
  return pda([seed(SEEDS.queueEscrow), coin.toBuffer()]);
}
/** `QueueEntry` of `owner` on `coin`: seeds `["queue", coin, owner]`. */
export function queueEntryPda(coin: PublicKey, owner: PublicKey): PublicKey {
  return pda([seed(SEEDS.queueEntry), coin.toBuffer(), owner.toBuffer()]);
}
/** `EpochRecord` of a closed queue epoch: seeds `["epoch", coin, epoch u32 LE]`. */
export function epochRecordPda(coin: PublicKey, epoch: number): PublicKey {
  return pda([seed(SEEDS.epoch), coin.toBuffer(), u32le(epoch)]);
}
/** Metaplex metadata PDA: `["metadata", METADATA_PROGRAM_ID, mint]` under the metadata program. */
export function metadataPda(mint: PublicKey): PublicKey {
  return findPda([seed(SEEDS.metadata), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()], METADATA_PROGRAM_ID)[0];
}
/** Associated token account (classic SPL Token program). */
export function userTokenAccount(owner: PublicKey, mint: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
}

/** Every address of one coin (mirrors `CoinKeys` in tests-rs). */
export interface CoinKeys {
  mint: PublicKey;
  coin: PublicKey;
  curveVault: PublicKey;
  floorReserve: PublicKey;
  poolSolVault: PublicKey;
  feeVault: PublicKey;
  queueSolVault: PublicKey;
  curveTokenVault: PublicKey;
  poolTokenVault: PublicKey;
  queueEscrow: PublicKey;
  metadata: PublicKey;
}

const keysCache = new Map<string, CoinKeys>();

/** Derive (and memoize) every PDA of the coin whose mint is `mint`. */
export function coinKeys(mint: PublicKey): CoinKeys {
  const id = mint.toBase58();
  const hit = keysCache.get(id);
  if (hit) return hit;
  const coin = coinPda(mint);
  const k: CoinKeys = Object.freeze({
    mint,
    coin,
    curveVault: curveVaultPda(coin),
    floorReserve: floorReservePda(coin),
    poolSolVault: poolSolVaultPda(coin),
    feeVault: feeVaultPda(coin),
    queueSolVault: queueSolVaultPda(coin),
    curveTokenVault: curveTokenVaultPda(coin),
    poolTokenVault: poolTokenVaultPda(coin),
    queueEscrow: queueEscrowPda(coin),
    metadata: metadataPda(mint),
  });
  if (keysCache.size > 1024) keysCache.clear();
  keysCache.set(id, k);
  return k;
}
