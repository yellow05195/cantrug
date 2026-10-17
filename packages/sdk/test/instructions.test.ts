import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Keypair, type TransactionInstruction } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  DEFAULT_PARAMS,
  INSTRUCTION_DISCRIMINATORS,
  INSTRUCTION_NAMES,
  METADATA_PROGRAM_ID,
  PROGRAM_ID,
  RENT_SYSVAR_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  buyIx,
  cancelQueueIx,
  claimCreatorFeesIx,
  claimProtocolFeesIx,
  claimQueueIx,
  coinKeys,
  configPda,
  createCoinIx,
  createCoinTx,
  epochRecordPda,
  graduateIx,
  identifyInstruction,
  initializeIx,
  processQueueIx,
  queueEntryPda,
  queueToRedeemIx,
  redeemIx,
  sellIx,
  swapBuyIx,
  swapSellIx,
  updateConfigIx,
  userTokenAccount,
  type InstructionName,
} from "../src/index.js";

interface IdlIx {
  name: string;
  discriminator: number[];
  accounts: { name: string; writable?: boolean; signer?: boolean }[];
  args: { name: string; type: unknown }[];
}
const idl = JSON.parse(readFileSync(fileURLToPath(new URL("../../../programs/floored/idl/floored.json", import.meta.url)), "utf8")) as {
  instructions: IdlIx[];
};

const sha8 = (s: string) => [...createHash("sha256").update(s).digest().subarray(0, 8)];
const kp = (n: number) => Keypair.fromSeed(new Uint8Array(32).fill(n)).publicKey;
const user = kp(2);
const mint = kp(1);
const recipient = kp(3);
const k = coinKeys(mint);
const EPOCH = 3;
const ENTRY_EPOCH = 1;

const built: Record<InstructionName, TransactionInstruction> = {
  initialize: initializeIx({ authority: user, params: DEFAULT_PARAMS, crankReward: 2_000_000n, createFee: 20_000_000n, protocolFeeRecipient: recipient }),
  update_config: updateConfigIx({ authority: user, crankReward: 5n, newAuthority: recipient }),
  create_coin: createCoinIx({ creator: user, protocolFeeRecipient: recipient, mint, name: "Floored Test", symbol: "FLRT", uri: "https://floored.fun/m.json" }),
  buy: buyIx({ user, mint, solMax: 1_000_000_000n, minTokensOut: 1n }),
  sell: sellIx({ user, mint, epoch: EPOCH, tokensIn: 10n, minSolOut: 0n, queueRemainder: true }),
  graduate: graduateIx({ caller: user, mint }),
  swap_buy: swapBuyIx({ user, mint, solIn: 7n, minTokensOut: 0n }),
  swap_sell: swapSellIx({ user, mint, epoch: EPOCH, tokensIn: 10n, minSolOut: 0n, queueRemainder: false }),
  redeem: redeemIx({ user, mint, tokens: 123n }),
  process_queue: processQueueIx({ caller: user, mint, epoch: EPOCH }),
  claim_queue: claimQueueIx({ user, mint, entryEpoch: ENTRY_EPOCH }),
  cancel_queue: cancelQueueIx({ user, mint, entryEpoch: ENTRY_EPOCH }),
  queue_to_redeem: queueToRedeemIx({ user, mint, entryEpoch: ENTRY_EPOCH }),
  claim_creator_fees: claimCreatorFeesIx({ creator: user, mint }),
  claim_protocol_fees: claimProtocolFeesIx({ caller: user, mint, protocolFeeRecipient: recipient }),
};

describe("instructions vs IDL", () => {
  it("covers exactly the 15 IDL instructions", () => {
    expect([...INSTRUCTION_NAMES].sort()).toEqual(idl.instructions.map((i) => i.name).sort());
    expect(INSTRUCTION_NAMES).toHaveLength(15);
  });

  it("sha256('global:redeem')[0..8]", () => {
    expect([...INSTRUCTION_DISCRIMINATORS.redeem]).toEqual([184, 12, 86, 149, 70, 196, 97, 225]);
    expect([...INSTRUCTION_DISCRIMINATORS.redeem]).toEqual(sha8("global:redeem"));
  });

  for (const spec of idl.instructions) {
    it(`${spec.name}: discriminator, account count and flags`, () => {
      const name = spec.name as InstructionName;
      const ix = built[name];
      expect(ix.programId.equals(PROGRAM_ID)).toBe(true);
      expect([...ix.data.subarray(0, 8)]).toEqual(spec.discriminator);
      expect([...ix.data.subarray(0, 8)]).toEqual(sha8(`global:${spec.name}`));
      expect(identifyInstruction(ix.data)).toBe(name);
      expect(ix.keys.length).toBe(spec.accounts.length);
      spec.accounts.forEach((a, i) => {
        expect({ account: a.name, w: ix.keys[i]!.isWritable, s: ix.keys[i]!.isSigner }).toEqual({
          account: a.name,
          w: !!a.writable,
          s: !!a.signer,
        });
      });
    });
  }

  it("addresses land where tests-rs puts them", () => {
    const at = (n: InstructionName, account: string) => {
      const spec = idl.instructions.find((i) => i.name === n)!;
      return built[n].keys[spec.accounts.findIndex((a) => a.name === account)]!.pubkey.toBase58();
    };
    const userAta = userTokenAccount(user, mint).toBase58();
    expect(at("initialize", "config")).toBe(configPda().toBase58());
    expect(at("initialize", "system_program")).toBe(SYSTEM_PROGRAM_ID.toBase58());
    expect(at("create_coin", "mint")).toBe(mint.toBase58());
    expect(at("create_coin", "metadata")).toBe(k.metadata.toBase58());
    expect(at("create_coin", "token_metadata_program")).toBe(METADATA_PROGRAM_ID.toBase58());
    expect(at("create_coin", "rent")).toBe(RENT_SYSVAR_ID.toBase58());
    expect(at("buy", "user_token")).toBe(userAta);
    expect(at("buy", "associated_token_program")).toBe(ASSOCIATED_TOKEN_PROGRAM_ID.toBase58());
    expect(at("sell", "queue_entry")).toBe(queueEntryPda(k.coin, user).toBase58());
    expect(at("sell", "epoch_record")).toBe(epochRecordPda(k.coin, EPOCH).toBase58());
    expect(at("swap_sell", "epoch_record")).toBe(epochRecordPda(k.coin, EPOCH).toBase58());
    expect(at("process_queue", "epoch_record")).toBe(epochRecordPda(k.coin, EPOCH).toBase58());
    expect(at("claim_queue", "epoch_record")).toBe(epochRecordPda(k.coin, ENTRY_EPOCH).toBase58());
    expect(at("queue_to_redeem", "epoch_record")).toBe(epochRecordPda(k.coin, ENTRY_EPOCH).toBase58());
    expect(at("redeem", "pool_token_vault")).toBe(k.poolTokenVault.toBase58());
    expect(at("redeem", "token_program")).toBe(TOKEN_PROGRAM_ID.toBase58());
    expect(at("claim_protocol_fees", "protocol_fee_recipient")).toBe(recipient.toBase58());
    expect(at("graduate", "pool_sol_vault")).toBe(k.poolSolVault.toBase58());
  });
});

describe("argument encoding (borsh, as tests-rs)", () => {
  it("initialize: CoinParams + u64 + u64 + pubkey", () => {
    const d = built.initialize.data;
    expect(d.length).toBe(8 + 56 + 8 + 8 + 32);
    expect(d.readBigUInt64LE(8)).toBe(DEFAULT_PARAMS.virtualSol);
    expect(d.readUInt16LE(8 + 32)).toBe(DEFAULT_PARAMS.curveFeeBps);
    expect(d.readUInt16LE(8 + 32 + 14)).toBe(DEFAULT_PARAMS.brakeDropBps);
    expect(d.readBigUInt64LE(8 + 48)).toBe(DEFAULT_PARAMS.brakeWindowSlots);
    expect(d.readBigUInt64LE(8 + 56)).toBe(2_000_000n);
    expect(d.subarray(8 + 72).equals(recipient.toBuffer())).toBe(true);
  });

  it("update_config: Option tags", () => {
    const d = built.update_config.data.subarray(8);
    // params None, crank_reward Some(5), create_fee None, recipient None, new_authority Some
    expect(d[0]).toBe(0);
    expect(d[1]).toBe(1);
    expect(d.readBigUInt64LE(2)).toBe(5n);
    expect(d[10]).toBe(0);
    expect(d[11]).toBe(0);
    expect(d[12]).toBe(1);
    expect(d.subarray(13).equals(recipient.toBuffer())).toBe(true);
  });

  it("create_coin: three borsh strings", () => {
    const d = built.create_coin.data.subarray(8);
    expect(d.readUInt32LE(0)).toBe(12);
    expect(d.subarray(4, 16).toString()).toBe("Floored Test");
    expect(() => createCoinIx({ creator: user, protocolFeeRecipient: recipient, mint, name: "x".repeat(33), symbol: "A", uri: "" })).toThrow();
  });

  it("sell / swap_sell: u64 + u64 + bool", () => {
    const d = built.sell.data;
    expect(d.length).toBe(8 + 17);
    expect(d.readBigUInt64LE(8)).toBe(10n);
    expect(d[24]).toBe(1);
    expect(built.swap_sell.data[24]).toBe(0);
  });

  it("buy / redeem payloads", () => {
    expect(built.buy.data.readBigUInt64LE(8)).toBe(1_000_000_000n);
    expect(built.buy.data.readBigUInt64LE(16)).toBe(1n);
    expect(built.redeem.data.length).toBe(16);
    expect(built.redeem.data.readBigUInt64LE(8)).toBe(123n);
    for (const n of ["graduate", "process_queue", "claim_queue", "cancel_queue", "queue_to_redeem", "claim_creator_fees", "claim_protocol_fees"] as const) {
      expect(built[n].data.length).toBe(8);
    }
  });

  it("createCoinTx composes compute budget + create_coin + first buy", () => {
    const tx = createCoinTx({
      creator: user,
      protocolFeeRecipient: recipient,
      mint,
      name: "A",
      symbol: "B",
      uri: "C",
      firstBuy: { solMax: 1_000_000n, minTokensOut: 0n },
      computeUnitPrice: 1000,
    });
    expect(tx.instructions).toHaveLength(4);
    expect(tx.feePayer?.equals(user)).toBe(true);
    expect(identifyInstruction(tx.instructions[2]!.data)).toBe("create_coin");
    expect(identifyInstruction(tx.instructions[3]!.data)).toBe("buy");
    expect(createCoinTx({ creator: user, protocolFeeRecipient: recipient, mint, name: "A", symbol: "B", uri: "C", computeUnits: 0 }).instructions).toHaveLength(1);
  });
});
