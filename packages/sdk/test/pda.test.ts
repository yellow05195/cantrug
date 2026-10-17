import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  METADATA_PROGRAM_ID,
  PROGRAM_ID,
  SEEDS,
  coinKeys,
  configPda,
  epochRecordPda,
  queueEntryPda,
  u32le,
  userTokenAccount,
} from "../src/index.js";

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));

/** `pub const SEED_X: &[u8] = b"..."` from state.rs. */
function rustSeeds(): Record<string, string> {
  const src = readFileSync(root("programs/floored/src/state.rs"), "utf8");
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/pub const (SEED_\w+): &\[u8\] = b"([^"]*)";/g)) out[m[1]!] = m[2]!;
  return out;
}

const mint = Keypair.fromSeed(new Uint8Array(32).fill(1)).publicKey;
const owner = Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey;

/** Computed once with this SDK, frozen here to catch any accidental seed / program-id change. */
const EXPECTED = {
  config: "grrz8Ka6AP14U6fAKXdgj9dfGtQ23NS3kzBP7DeC2jA",
  owner: "9hSR6S7WPtxmTojgo6GG3k4yDPecgJY292j7xrsUGWBu",
  mint: "AKnL4NNf3DGWZJS6cPknBuEGnVsV4A4m5tgebLHaRSZ9",
  coin: "7eDEmMV2MQA8xYAEUkNLHARPPnGRv1rncJ9GpEzBMWZy",
  curveVault: "5tzagYpbw49D3uZaUCtxm4FEWFVVeQVsNErFDxwgVGaJ",
  floorReserve: "AKcQXKFQZXzVqdLoQ6MmYFzMkdv34foTtxQ3s1jqByaT",
  poolSolVault: "FJZGWqDp6zQoLqnWxHoiZz8qCwMWZu1ynGGHZPRsEmc1",
  feeVault: "61teiRHXz9XRECBQ84Mg3zVTBKWtVWiRma26R5bVPKYr",
  queueSolVault: "BVghenDwzD64k2Xcj8QzEbwg3a8UnLSg8sn5Zb4mtrEN",
  curveTokenVault: "EPqP4hGCB8cyDbxDX6HjBCPWN69d56mATMqbeh7h2U6n",
  poolTokenVault: "Hs8WMNVDFABud5wM95aeo4BfYJaNjPnxNDrUukzgLbyx",
  queueEscrow: "BVZZkCcGKjHP5eQbWcvbnG1EV52iq3Gx7Ko6z9SWj1Xh",
  metadata: "CHsp7S2p7eV58YVpSCsMNb83sGKxnn1ogsCUwqkmtuYQ",
  queueEntry: "8D2Pm92CEGL4jdGeokg3b53QnqK17vx1vFCAyQKwwBG6",
  epoch0: "2pE2V9oc4Sb9C7Muz4hDEWmWY8gFf4mBK762SFDp6jKi",
  epoch7: "6tfwaEQQeqVM89nB9YfQy9djKTNy7XkAfg8okfJvhQe1",
  ata: "FpMLM8i6S8LG7qi1kGWa3nKgV16atPNHXnvVhTznogzR",
};

describe("PDAs", () => {
  it("program ids", () => {
    expect(PROGRAM_ID.toBase58()).toBe("E7ZbamLD8wenjjHitR8bUHwuNKA4Em39sqybnhk3nc87");
    expect(METADATA_PROGRAM_ID.toBase58()).toBe("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
    const idl = JSON.parse(readFileSync(root("programs/floored/idl/floored.json"), "utf8")) as { address: string };
    expect(idl.address).toBe(PROGRAM_ID.toBase58());
  });

  it("SDK seeds are byte-identical to the SEED_* constants of state.rs", () => {
    const rs = rustSeeds();
    expect(rs).toEqual({
      SEED_CONFIG: SEEDS.config,
      SEED_COIN: SEEDS.coin,
      SEED_CURVE_VAULT: SEEDS.curveVault,
      SEED_FLOOR_RESERVE: SEEDS.floorReserve,
      SEED_POOL_SOL: SEEDS.poolSol,
      SEED_FEE_VAULT: SEEDS.feeVault,
      SEED_QUEUE_SOL: SEEDS.queueSol,
      SEED_CURVE_TOKENS: SEEDS.curveTokens,
      SEED_POOL_TOKENS: SEEDS.poolTokens,
      SEED_QUEUE_ESCROW: SEEDS.queueEscrow,
      SEED_QUEUE_ENTRY: SEEDS.queueEntry,
      SEED_EPOCH: SEEDS.epoch,
    });
  });

  it("coinKeys / config / queue / epoch / ATA match the frozen expectations", () => {
    const k = coinKeys(mint);
    const got: Record<string, string> = { config: configPda().toBase58(), owner: owner.toBase58() };
    for (const [n, v] of Object.entries(k)) got[n] = (v as PublicKey).toBase58();
    got.queueEntry = queueEntryPda(k.coin, owner).toBase58();
    got.epoch0 = epochRecordPda(k.coin, 0).toBase58();
    got.epoch7 = epochRecordPda(k.coin, 7).toBase58();
    got.ata = userTokenAccount(owner, mint).toBase58();
    expect(got).toEqual(EXPECTED);
  });

  it("queueEntry and epochRecord follow the Rust seeds exactly", () => {
    const rs = rustSeeds();
    const coin = coinKeys(mint).coin;
    const f = (seeds: Uint8Array[]) => PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0].toBase58();
    // [SEED_QUEUE_ENTRY, coin, owner]
    expect(queueEntryPda(coin, owner).toBase58()).toBe(f([Buffer.from(rs.SEED_QUEUE_ENTRY!), coin.toBuffer(), owner.toBuffer()]));
    // [SEED_EPOCH, coin, epoch.to_le_bytes()] with a u32 epoch
    for (const epoch of [0, 1, 7, 256, 0xdeadbeef]) {
      const le = Buffer.alloc(4);
      le.writeUInt32LE(epoch);
      expect(epochRecordPda(coin, epoch).toBase58()).toBe(f([Buffer.from(rs.SEED_EPOCH!), coin.toBuffer(), le]));
    }
    expect([...u32le(0x01020304)]).toEqual([4, 3, 2, 1]);
    expect(() => u32le(2 ** 32)).toThrow();
    // coin PDA: [SEED_COIN, mint]
    expect(coin.toBase58()).toBe(f([Buffer.from(rs.SEED_COIN!), mint.toBuffer()]));
    // metadata PDA under the metadata program
    expect(coinKeys(mint).metadata.toBase58()).toBe(
      PublicKey.findProgramAddressSync([Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()], METADATA_PROGRAM_ID)[0].toBase58(),
    );
  });

  it("vault PDAs hang off the coin PDA, not the mint", () => {
    const k = coinKeys(mint);
    const f = (s: string) => PublicKey.findProgramAddressSync([Buffer.from(s), k.coin.toBuffer()], PROGRAM_ID)[0];
    expect(k.curveVault.equals(f("curve_sol"))).toBe(true);
    expect(k.queueEscrow.equals(f("queue_escrow"))).toBe(true);
  });
});
