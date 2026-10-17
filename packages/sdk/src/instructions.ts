/**
 * Instruction builders for all 15 FLOORED instructions. Account metas are in
 * IDL order with the IDL's writable / signer flags, data is the 8-byte
 * Anchor discriminator `sha256("global:<name>")[0..8]` followed by Borsh
 * args, exactly as `tests-rs/src/lib.rs` builds them.
 */
import type { Buffer } from "buffer";
import { ComputeBudgetProgram, PublicKey, Transaction, TransactionInstruction, type AccountMeta } from "@solana/web3.js";
import { BorshWriter, instructionDiscriminator } from "./borsh.js";
import { writeCoinParams, type CoinParams } from "./accounts.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  METADATA_PROGRAM_ID,
  PROGRAM_ID,
  RENT_SYSVAR_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  coinKeys,
  configPda,
  epochRecordPda,
  queueEntryPda,
  userTokenAccount,
} from "./pda.js";

export const INSTRUCTION_NAMES = [
  "initialize",
  "update_config",
  "create_coin",
  "buy",
  "sell",
  "graduate",
  "swap_buy",
  "swap_sell",
  "redeem",
  "process_queue",
  "claim_queue",
  "cancel_queue",
  "queue_to_redeem",
  "claim_creator_fees",
  "claim_protocol_fees",
] as const;
export type InstructionName = (typeof INSTRUCTION_NAMES)[number];

export const INSTRUCTION_DISCRIMINATORS: Readonly<Record<InstructionName, Uint8Array>> = Object.freeze(
  Object.fromEntries(INSTRUCTION_NAMES.map((n) => [n, instructionDiscriminator(n)])) as unknown as Record<InstructionName, Uint8Array>,
);

/** Identify which FLOORED instruction `data` encodes, from its discriminator. */
export function identifyInstruction(data: Uint8Array): InstructionName | null {
  if (data.length < 8) return null;
  for (const n of INSTRUCTION_NAMES) {
    const d = INSTRUCTION_DISCRIMINATORS[n];
    let ok = true;
    for (let i = 0; i < 8; i++) if (data[i] !== d[i]) ok = false;
    if (ok) return n;
  }
  return null;
}

const w = (pubkey: PublicKey): AccountMeta => ({ pubkey, isSigner: false, isWritable: true });
const r = (pubkey: PublicKey): AccountMeta => ({ pubkey, isSigner: false, isWritable: false });
const ws = (pubkey: PublicKey): AccountMeta => ({ pubkey, isSigner: true, isWritable: true });
const rs = (pubkey: PublicKey): AccountMeta => ({ pubkey, isSigner: true, isWritable: false });

function data(name: InstructionName, args?: (w: BorshWriter) => void): Buffer {
  const wr = new BorshWriter().raw(INSTRUCTION_DISCRIMINATORS[name]);
  if (args) args(wr);
  return wr.toBuffer();
}

function ix(keys: AccountMeta[], d: Buffer): TransactionInstruction {
  return new TransactionInstruction({ programId: PROGRAM_ID, keys, data: d });
}

type Amount = bigint | number;

// ─────────────────────────────── config ───────────────────────────────

export interface InitializeArgs {
  authority: PublicKey;
  params: CoinParams;
  crankReward: Amount;
  createFee: Amount;
  protocolFeeRecipient: PublicKey;
}

export function initializeIx(a: InitializeArgs): TransactionInstruction {
  return ix(
    [ws(a.authority), w(configPda()), r(SYSTEM_PROGRAM_ID)],
    data("initialize", (d) => {
      writeCoinParams(d, a.params);
      d.u64(a.crankReward).u64(a.createFee).pubkey(a.protocolFeeRecipient);
    }),
  );
}

export interface UpdateConfigArgs {
  authority: PublicKey;
  params?: CoinParams | null;
  crankReward?: Amount | null;
  createFee?: Amount | null;
  protocolFeeRecipient?: PublicKey | null;
  newAuthority?: PublicKey | null;
}

export function updateConfigIx(a: UpdateConfigArgs): TransactionInstruction {
  return ix(
    [rs(a.authority), w(configPda())],
    data("update_config", (d) => {
      d.option(a.params, (x, v) => writeCoinParams(x, v));
      d.option(a.crankReward, (x, v) => x.u64(v));
      d.option(a.createFee, (x, v) => x.u64(v));
      d.option(a.protocolFeeRecipient, (x, v) => x.pubkey(v));
      d.option(a.newAuthority, (x, v) => x.pubkey(v));
    }),
  );
}

// ─────────────────────────────── create ───────────────────────────────

export const MAX_NAME = 32;
export const MAX_SYMBOL = 10;
export const MAX_URI = 200;

export interface CreateCoinArgs {
  creator: PublicKey;
  /** Must equal `GlobalConfig.protocolFeeRecipient`. */
  protocolFeeRecipient: PublicKey;
  /** Fresh mint keypair's public key; the mint keypair must sign. */
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
}

function checkLen(field: string, s: string, max: number): void {
  const n = new TextEncoder().encode(s).length;
  if (n > max) throw new RangeError(`${field} is ${n} bytes, max ${max}`);
}

export function createCoinIx(a: CreateCoinArgs): TransactionInstruction {
  checkLen("name", a.name, MAX_NAME);
  checkLen("symbol", a.symbol, MAX_SYMBOL);
  checkLen("uri", a.uri, MAX_URI);
  const k = coinKeys(a.mint);
  return ix(
    [
      ws(a.creator),
      w(configPda()),
      w(a.protocolFeeRecipient),
      w(k.coin),
      ws(k.mint),
      w(k.curveVault),
      w(k.floorReserve),
      w(k.poolSolVault),
      w(k.feeVault),
      w(k.queueSolVault),
      w(k.curveTokenVault),
      w(k.poolTokenVault),
      w(k.queueEscrow),
      w(k.metadata),
      r(METADATA_PROGRAM_ID),
      r(TOKEN_PROGRAM_ID),
      r(SYSTEM_PROGRAM_ID),
      r(RENT_SYSVAR_ID),
    ],
    data("create_coin", (d) => d.string(a.name).string(a.symbol).string(a.uri)),
  );
}

// ─────────────────────────────── curve trades ───────────────────────────────

export interface UserArgs {
  user: PublicKey;
  mint: PublicKey;
  /** Token account of the user; defaults to the user's ATA. */
  userToken?: PublicKey;
}

export interface BuyArgs extends UserArgs {
  solMax: Amount;
  minTokensOut: Amount;
}

export function buyIx(a: BuyArgs): TransactionInstruction {
  const k = coinKeys(a.mint);
  return ix(
    [
      ws(a.user),
      w(k.coin),
      r(k.mint),
      w(k.curveVault),
      w(k.floorReserve),
      w(k.feeVault),
      w(k.curveTokenVault),
      w(a.userToken ?? userTokenAccount(a.user, a.mint)),
      r(TOKEN_PROGRAM_ID),
      r(ASSOCIATED_TOKEN_PROGRAM_ID),
      r(SYSTEM_PROGRAM_ID),
    ],
    data("buy", (d) => d.u64(a.solMax).u64(a.minTokensOut)),
  );
}

export interface SellArgs extends UserArgs {
  /** Current queue epoch, `CoinState.brake.epoch` (seeds of the epoch_record account). */
  epoch: number;
  tokensIn: Amount;
  /** Price limit, pro rata of the executed part. */
  minSolOut: Amount;
  /** Queue what the brake holds back (true) or drop it (false). */
  queueRemainder: boolean;
}

export function sellIx(a: SellArgs): TransactionInstruction {
  const k = coinKeys(a.mint);
  return ix(
    [
      ws(a.user),
      r(configPda()),
      w(k.coin),
      r(k.mint),
      w(k.curveVault),
      w(k.floorReserve),
      w(k.feeVault),
      w(k.queueSolVault),
      w(k.curveTokenVault),
      w(k.queueEscrow),
      w(a.userToken ?? userTokenAccount(a.user, a.mint)),
      w(queueEntryPda(k.coin, a.user)),
      w(epochRecordPda(k.coin, a.epoch)),
      r(TOKEN_PROGRAM_ID),
      r(SYSTEM_PROGRAM_ID),
    ],
    data("sell", (d) => d.u64(a.tokensIn).u64(a.minSolOut).bool(a.queueRemainder)),
  );
}

// ─────────────────────────────── graduation ───────────────────────────────

export interface GraduateArgs {
  caller: PublicKey;
  mint: PublicKey;
}

export function graduateIx(a: GraduateArgs): TransactionInstruction {
  const k = coinKeys(a.mint);
  return ix(
    [
      ws(a.caller),
      w(configPda()),
      w(k.coin),
      r(k.mint),
      w(k.curveVault),
      w(k.floorReserve),
      w(k.poolSolVault),
      w(k.feeVault),
      w(k.curveTokenVault),
      w(k.poolTokenVault),
      r(TOKEN_PROGRAM_ID),
    ],
    data("graduate"),
  );
}

// ─────────────────────────────── pool trades ───────────────────────────────

export interface SwapBuyArgs extends UserArgs {
  solIn: Amount;
  minTokensOut: Amount;
}

export function swapBuyIx(a: SwapBuyArgs): TransactionInstruction {
  const k = coinKeys(a.mint);
  return ix(
    [
      ws(a.user),
      w(k.coin),
      r(k.mint),
      w(k.poolSolVault),
      w(k.feeVault),
      w(k.poolTokenVault),
      w(a.userToken ?? userTokenAccount(a.user, a.mint)),
      r(TOKEN_PROGRAM_ID),
      r(ASSOCIATED_TOKEN_PROGRAM_ID),
      r(SYSTEM_PROGRAM_ID),
    ],
    data("swap_buy", (d) => d.u64(a.solIn).u64(a.minTokensOut)),
  );
}

export type SwapSellArgs = SellArgs;

export function swapSellIx(a: SwapSellArgs): TransactionInstruction {
  const k = coinKeys(a.mint);
  return ix(
    [
      ws(a.user),
      r(configPda()),
      w(k.coin),
      r(k.mint),
      w(k.poolSolVault),
      w(k.feeVault),
      w(k.queueSolVault),
      w(k.poolTokenVault),
      w(k.queueEscrow),
      w(a.userToken ?? userTokenAccount(a.user, a.mint)),
      w(queueEntryPda(k.coin, a.user)),
      w(epochRecordPda(k.coin, a.epoch)),
      r(TOKEN_PROGRAM_ID),
      r(SYSTEM_PROGRAM_ID),
    ],
    data("swap_sell", (d) => d.u64(a.tokensIn).u64(a.minSolOut).bool(a.queueRemainder)),
  );
}

// ─────────────────────────────── the floor ───────────────────────────────

export interface RedeemArgs extends UserArgs {
  tokens: Amount;
}

export function redeemIx(a: RedeemArgs): TransactionInstruction {
  const k = coinKeys(a.mint);
  return ix(
    [
      ws(a.user),
      w(configPda()),
      w(k.coin),
      w(k.mint),
      w(k.poolSolVault),
      w(k.poolTokenVault),
      w(a.userToken ?? userTokenAccount(a.user, a.mint)),
      r(TOKEN_PROGRAM_ID),
    ],
    data("redeem", (d) => d.u64(a.tokens)),
  );
}

// ─────────────────────────────── the queue ───────────────────────────────

export interface ProcessQueueArgs {
  caller: PublicKey;
  mint: PublicKey;
  /** Current queue epoch, `CoinState.brake.epoch`. */
  epoch: number;
}

export function processQueueIx(a: ProcessQueueArgs): TransactionInstruction {
  const k = coinKeys(a.mint);
  return ix(
    [
      ws(a.caller),
      r(configPda()),
      w(k.coin),
      r(k.mint),
      w(k.curveVault),
      w(k.floorReserve),
      w(k.poolSolVault),
      w(k.feeVault),
      w(k.queueSolVault),
      w(k.curveTokenVault),
      w(k.poolTokenVault),
      w(k.queueEscrow),
      w(epochRecordPda(k.coin, a.epoch)),
      r(TOKEN_PROGRAM_ID),
      r(SYSTEM_PROGRAM_ID),
    ],
    data("process_queue"),
  );
}

export interface SettleQueueArgs extends UserArgs {
  /** Epoch of the user's `QueueEntry` (`QueueEntry.epoch`), not the coin's current one. */
  entryEpoch: number;
}

function settleAccounts(a: SettleQueueArgs): AccountMeta[] {
  const k = coinKeys(a.mint);
  return [
    ws(a.user),
    w(k.coin),
    r(k.mint),
    w(k.queueSolVault),
    w(k.queueEscrow),
    w(a.userToken ?? userTokenAccount(a.user, a.mint)),
    w(queueEntryPda(k.coin, a.user)),
    r(epochRecordPda(k.coin, a.entryEpoch)),
    r(TOKEN_PROGRAM_ID),
  ];
}

/** Take the SOL earned so far and stay queued. */
export function claimQueueIx(a: SettleQueueArgs): TransactionInstruction {
  return ix(settleAccounts(a), data("claim_queue"));
}

/** Take the SOL earned and the tokens still queued; closes the position. */
export function cancelQueueIx(a: SettleQueueArgs): TransactionInstruction {
  return ix(settleAccounts(a), data("cancel_queue"));
}

export type QueueToRedeemArgs = Omit<SettleQueueArgs, "userToken">;

/** Leave the queue and redeem what is left at the floor, instantly. */
export function queueToRedeemIx(a: QueueToRedeemArgs): TransactionInstruction {
  const k = coinKeys(a.mint);
  return ix(
    [
      ws(a.user),
      w(configPda()),
      w(k.coin),
      w(k.mint),
      w(k.poolSolVault),
      w(k.poolTokenVault),
      w(k.queueSolVault),
      w(k.queueEscrow),
      w(queueEntryPda(k.coin, a.user)),
      r(epochRecordPda(k.coin, a.entryEpoch)),
      r(TOKEN_PROGRAM_ID),
    ],
    data("queue_to_redeem"),
  );
}

// ─────────────────────────────── fees ───────────────────────────────

export interface ClaimCreatorFeesArgs {
  creator: PublicKey;
  mint: PublicKey;
}

export function claimCreatorFeesIx(a: ClaimCreatorFeesArgs): TransactionInstruction {
  const k = coinKeys(a.mint);
  return ix([ws(a.creator), w(k.coin), w(k.feeVault)], data("claim_creator_fees"));
}

export interface ClaimProtocolFeesArgs {
  caller: PublicKey;
  mint: PublicKey;
  /** Must equal `GlobalConfig.protocolFeeRecipient`. */
  protocolFeeRecipient: PublicKey;
}

export function claimProtocolFeesIx(a: ClaimProtocolFeesArgs): TransactionInstruction {
  const k = coinKeys(a.mint);
  return ix(
    [rs(a.caller), r(configPda()), w(k.coin), w(k.feeVault), w(a.protocolFeeRecipient)],
    data("claim_protocol_fees"),
  );
}

// ─────────────────────────────── compute budget / composition ───────────────────────────────

/** `ComputeBudgetProgram.setComputeUnitLimit`. */
export function setComputeUnitLimit(units: number): TransactionInstruction {
  return ComputeBudgetProgram.setComputeUnitLimit({ units });
}

/** `ComputeBudgetProgram.setComputeUnitPrice` (micro-lamports per CU). */
export function setComputeUnitPrice(microLamports: Amount): TransactionInstruction {
  return ComputeBudgetProgram.setComputeUnitPrice({ microLamports: BigInt(microLamports) });
}

/** Default CU limit for `create_coin` (+ first buy): Metaplex CPI plus three token-account inits. */
export const CREATE_COIN_COMPUTE_UNITS = 600_000;

export interface CreateCoinTxArgs extends CreateCoinArgs {
  /** Optional first buy by the creator, in the same transaction. */
  firstBuy?: { solMax: Amount; minTokensOut: Amount };
  /** CU limit; default `CREATE_COIN_COMPUTE_UNITS`. Pass 0 to omit the instruction. */
  computeUnits?: number;
  /** Priority fee in micro-lamports per CU; omitted when undefined or 0. */
  computeUnitPrice?: Amount;
}

/**
 * `create_coin` + optional first `buy`, with a compute budget. The returned
 * transaction has `feePayer = creator` and no blockhash: set
 * `recentBlockhash`, then have both the creator and the mint keypair sign.
 */
export function createCoinTx(a: CreateCoinTxArgs): Transaction {
  const tx = new Transaction();
  tx.feePayer = a.creator;
  const cu = a.computeUnits ?? CREATE_COIN_COMPUTE_UNITS;
  if (cu > 0) tx.add(setComputeUnitLimit(cu));
  if (a.computeUnitPrice !== undefined && BigInt(a.computeUnitPrice) > 0n) tx.add(setComputeUnitPrice(a.computeUnitPrice));
  tx.add(createCoinIx(a));
  if (a.firstBuy) {
    const buy: BuyArgs = {
      user: a.creator,
      mint: a.mint,
      solMax: a.firstBuy.solMax,
      minTokensOut: a.firstBuy.minTokensOut,
    };
    tx.add(buyIx(buy));
  }
  return tx;
}
