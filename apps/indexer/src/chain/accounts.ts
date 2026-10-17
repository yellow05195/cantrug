import { PublicKey } from "@solana/web3.js";
import { BorshReader, BorshWriter } from "./borsh.js";
import { anchorDiscriminator, bytesEqual } from "./discriminator.js";
import { CoinStateLayout } from "./layouts.js";
import type { CoinStateAccount } from "./types.js";

export const COIN_STATE_DISCRIMINATOR = anchorDiscriminator("account", "CoinState");

export function decodeCoinState(data: Uint8Array): CoinStateAccount {
  if (data.length < 8 || !bytesEqual(data.subarray(0, 8), COIN_STATE_DISCRIMINATOR)) {
    throw new Error("not a CoinState account");
  }
  return new BorshReader(data.subarray(8)).struct(CoinStateLayout) as unknown as CoinStateAccount;
}

export function encodeCoinState(acc: CoinStateAccount): Uint8Array {
  const w = new BorshWriter();
  w.raw(COIN_STATE_DISCRIMINATOR);
  w.struct(CoinStateLayout, acc as unknown as Record<string, unknown>);
  return w.toBytes();
}

export function coinPda(mint: string, programId: string): string {
  return PublicKey.findProgramAddressSync([Buffer.from("coin"), new PublicKey(mint).toBuffer()], new PublicKey(programId))[0].toBase58();
}
