import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import {
  ACCOUNT_SIZES,
  BorshWriter,
  DEFAULT_PARAMS,
  SCALE_ONE,
  TOTAL_SUPPLY,
  brakeAllowed,
  brakeAllowedNow,
  coinFloorQ64,
  decodeCoinState,
  decodeEpochRecord,
  decodeGlobalConfig,
  decodeQueueEntry,
  floorDisplay,
  formatFloorGap,
  formatSol,
  formatTokens,
  formatSignificant,
  identifyAccount,
  parseSol,
  phase,
  poolSell,
  queueEntryStatus,
  redeem,
  redeemQuote,
  reserves,
  sellQuote,
  writeCoinParams,
  type CoinState,
} from "../src/index.js";

const disc = (n: string) => createHash("sha256").update(`account:${n}`).digest().subarray(0, 8);
const mint = Keypair.fromSeed(new Uint8Array(32).fill(1)).publicKey;
const creator = Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey;

interface CoinFields {
  phase: number;
  realSol: bigint;
  tokensSold: bigint;
  poolSol: bigint;
  poolTok: bigint;
  refSol: bigint;
  refTok: bigint;
  windowStart: bigint;
  epoch: number;
  scale: bigint;
  solIndex: bigint;
  queued: bigint;
}

function coinBytes(c: CoinFields): Buffer {
  const w = new BorshWriter().raw(disc("CoinState")).pubkey(mint).pubkey(creator);
  writeCoinParams(w, DEFAULT_PARAMS);
  w.u8(c.phase).u64(c.realSol).u64(c.tokensSold).u64(0n).u64(c.poolSol).u64(c.poolTok);
  for (let i = 0; i < 10; i++) w.u64(BigInt(i + 100)); // fees + stats
  w.u64(c.refSol).u64(c.refTok).u64(c.windowStart).u32(c.epoch).u128(c.scale).u128(c.solIndex).u64(c.queued).u32(4).u32(5);
  w.u64(10n).u64(20n).u64(890_880n);
  for (let i = 0; i < 9; i++) w.u8(250 - i);
  w.raw(new Uint8Array(64));
  return w.toBuffer();
}

const graduated: CoinFields = {
  phase: 1,
  realSol: 0n,
  tokensSold: 793_086_956_520_892n,
  poolSol: 86_918_352_930n,
  poolTok: 202_971_436_477_782n,
  refSol: 86_918_352_930n,
  refTok: 202_971_436_477_782n,
  windowStart: 1_000n,
  epoch: 2,
  scale: SCALE_ONE,
  solIndex: 0n,
  queued: 0n,
};

describe("account decoders", () => {
  it("CoinState layout (size = 8 + INIT_SPACE) and derived helpers", () => {
    const bytes = coinBytes(graduated);
    expect(bytes.length).toBe(ACCOUNT_SIZES.CoinState);
    expect(identifyAccount(bytes)).toBe("CoinState");
    const c = decodeCoinState(bytes);
    expect(c.mint.equals(mint)).toBe(true);
    expect(c.params).toEqual(DEFAULT_PARAMS);
    expect(c.poolTok).toBe(graduated.poolTok);
    expect(c.creatorFeesOwed).toBe(100n);
    expect(c.volumeSol).toBe(109n);
    expect(c.brake.epoch).toBe(2);
    expect(c.brake.engagements).toBe(4);
    expect(c.brake.windowsProcessed).toBe(5);
    expect(c.vaultRent).toBe(890_880n);
    expect(c.bumps.coin).toBe(250);
    expect(c.bumps.queueEscrow).toBe(242);
    expect(phase(c)).toBe("graduated");
    expect(reserves(c)).toEqual({ sol: graduated.poolSol, tok: graduated.poolTok });

    // redeem quote equals the core function (and the redeem vector)
    const q = redeemQuote(c, TOTAL_SUPPLY, 12_345_678_000_000n);
    expect(q).toEqual(redeem(DEFAULT_PARAMS, { sol: c.poolSol, tok: c.poolTok }, 0n, TOTAL_SUPPLY, 12_345_678_000_000n));
    expect(q.solOut).toBe(1_339_601_510n);

    const fd = floorDisplay(c, TOTAL_SUPPLY);
    expect(coinFloorQ64(c, TOTAL_SUPPLY)).toBeGreaterThan(0n);
    expect(fd.gapPct).not.toBeNull();
    expect(fd.gapText).toMatch(/% above the floor$/);
  });

  it("rejects a wrong discriminator", () => {
    const bytes = coinBytes(graduated);
    bytes[0] = bytes[0]! ^ 0xff;
    expect(() => decodeCoinState(bytes)).toThrow(/discriminator/);
  });

  it("GlobalConfig, QueueEntry, EpochRecord", () => {
    const g = new BorshWriter().raw(disc("GlobalConfig")).pubkey(creator).pubkey(mint);
    writeCoinParams(g, DEFAULT_PARAMS);
    g.u64(2_000_000n).u64(20_000_000n).u64(7n).u64(3n).u64(99n).u64(11n).u8(254).raw(new Uint8Array(64));
    const gb = g.toBuffer();
    expect(gb.length).toBe(ACCOUNT_SIZES.GlobalConfig);
    const cfg = decodeGlobalConfig(gb);
    expect(cfg.authority.equals(creator)).toBe(true);
    expect(cfg.createFee).toBe(20_000_000n);
    expect(cfg.totalRedeems).toBe(11n);
    expect(cfg.bump).toBe(254);

    const e = new BorshWriter().raw(disc("QueueEntry")).pubkey(mint).pubkey(creator).u32(1).u128(3n * SCALE_ONE).u128(0n).u64(5n).u64(3n).u8(255);
    const eb = e.toBuffer();
    expect(eb.length).toBe(ACCOUNT_SIZES.QueueEntry);
    const entry = decodeQueueEntry(eb);
    expect(entry.shares).toBe(3n * SCALE_ONE);
    expect(entry.solIndexAtJoin).toBe(0n);

    // EpochRecord: disc + coin + epoch u32 + closed u8 + final_sol_index u128 LE + bump
    const r = new BorshWriter().raw(disc("EpochRecord")).pubkey(mint).u32(1).bool(true).u128(4n).u8(253);
    const rb = r.toBuffer();
    expect(rb.length).toBe(ACCOUNT_SIZES.EpochRecord);
    const rec = decodeEpochRecord(rb);
    expect(rec).toMatchObject({ epoch: 1, closed: true, finalSolIndex: 4n, bump: 253 });

    // entry from closed epoch 1 while the coin is in epoch 2: owed = shares × (final − join)
    const coin = decodeCoinState(coinBytes(graduated));
    expect(queueEntryStatus(entry, coin, rec)).toEqual({ remaining: 0n, owed: 12n, stale: true });
    expect(() => queueEntryStatus(entry, coin)).toThrow();
  });
});

describe("brake helpers", () => {
  it("brakeAllowedNow uses the window reference, and resets it when the window elapsed", () => {
    // price already 10 % down within the window
    const c: CoinState = decodeCoinState(
      coinBytes({ ...graduated, refSol: (graduated.poolSol * 10n) / 9n, refTok: graduated.poolTok }),
    );
    const now = brakeAllowedNow(c);
    expect(now).toBe(brakeAllowed(2_000, c.brake.refSol, c.brake.refTok, c.poolSol, c.poolTok));
    const fresh = brakeAllowedNow(c, c.brake.windowStart + 150n);
    expect(fresh).toBe(brakeAllowed(2_000, c.poolSol, c.poolTok, c.poolSol, c.poolTok));
    expect(fresh).toBeGreaterThan(now);
  });

  it("sellQuote splits executed / braked and serves the queue first on a new window", () => {
    const c = decodeCoinState(coinBytes({ ...graduated, queued: 10_000_000_000_000n }));
    const allowed = brakeAllowedNow(c);
    const q = sellQuote(c, allowed + 5n);
    expect(q.executed).toBe(allowed);
    expect(q.braked).toBe(5n);
    expect(q.quote).toEqual(poolSell(DEFAULT_PARAMS, { sol: c.poolSol, tok: c.poolTok }, allowed));

    const later = sellQuote(c, 1_000_000n, c.brake.windowStart + 150n);
    expect(later.queueFill?.sold).toBe(10_000_000_000_000n);
    expect(later.executed).toBe(1_000_000n);
  });

  it("curve phase prices on virtual reserves and has no floor yet", () => {
    const c = decodeCoinState(coinBytes({ ...graduated, phase: 0, realSol: 1_000_000_000n, tokensSold: 34_612_903_192_309n, poolSol: 0n, poolTok: 0n }));
    expect(phase(c)).toBe("curve");
    expect(reserves(c)).toEqual({ sol: 31_000_000_000n, tok: 1_073_000_000_000_000n - 34_612_903_192_309n });
    expect(coinFloorQ64(c, TOTAL_SUPPLY)).toBe(0n);
    expect(floorDisplay(c, TOTAL_SUPPLY).gapText).toBe("no floor yet");
    expect(() => redeemQuote(c, TOTAL_SUPPLY, 1n)).toThrow();
  });
});

describe("format", () => {
  it("amounts", () => {
    expect(formatSol(1_234_567_890n)).toBe("1.2345");
    expect(formatSol(1_000_000_000n, { minDecimals: 2 })).toBe("1.00");
    expect(formatSol(5n, { maxDecimals: 9 })).toBe("0.000000005");
    expect(parseSol("1.5")).toBe(1_500_000_000n);
    expect(() => parseSol("1.0000000001")).toThrow();
    expect(formatTokens(1_234_567_890_123n)).toBe("1 234 567.89");
    expect(formatTokens(1_000_000n, { group: "" })).toBe("1");
  });

  it("significant digits and floor gap", () => {
    expect(formatSignificant(0.000000028123, 4)).toBe("0.00000002812");
    expect(formatSignificant(123.456, 4)).toBe("123.5");
    expect(formatSignificant(98765, 3)).toBe("98800");
    expect(formatFloorGap(134n, 100n)).toBe("34 % above the floor");
    expect(formatFloorGap(1025n, 1000n)).toBe("2.5 % above the floor");
    expect(formatFloorGap(100n, 100n)).toBe("at the floor");
    expect(formatFloorGap(90n, 100n)).toBe("10 % below the floor");
    expect(formatFloorGap(90n, 0n)).toBe("no floor yet");
  });
});
