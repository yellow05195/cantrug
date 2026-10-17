import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CoreError,
  DEFAULT_PARAMS,
  QueueAcc,
  SCALE_ONE,
  TOTAL_SUPPLY,
  brakeAllowed,
  curveBuy,
  curveSell,
  entryOwed,
  entryRemaining,
  graduationPool,
  isqrt,
  mulDivCeil,
  mulDivFloor,
  poolBuy,
  poolSell,
  redeem,
  validateParams,
  windowStart,
} from "../src/index.js";

type Vector = Record<string, string>;

/** Load vectors.json keeping every integer exact (quoted before JSON.parse). */
function loadVectors(): Vector[] {
  const text = readFileSync(fileURLToPath(new URL("../vectors.json", import.meta.url)), "utf8");
  const quoted = text.replace(/:\s*(-?\d+)(?=\s*[,}\]])/g, ':"$1"');
  return JSON.parse(quoted) as Vector[];
}

const vectors = loadVectors();
const B = (v: string | undefined): bigint => {
  if (v === undefined) throw new Error("missing field");
  return BigInt(v);
};
const P = DEFAULT_PARAMS;

describe("parity with floored-core vectors.json", () => {
  it("has the 13 vectors emitted by the Rust tests", () => {
    expect(vectors.length).toBe(13);
  });

  vectors.forEach((v, i) => {
    it(`#${i} ${v.op}`, () => {
      switch (v.op) {
        case "curve_buy": {
          const q = curveBuy(P, { realSol: B(v.real_sol), tokensSold: B(v.tokens_sold) }, B(v.sol_max));
          expect(q.solNet).toBe(B(v.sol_net));
          expect(q.fee.total).toBe(B(v.fee));
          expect(q.fee.creator).toBe(B(v.creator));
          expect(q.fee.protocol).toBe(B(v.protocol));
          expect(q.fee.pool).toBe(B(v.pool));
          expect(q.tokensOut).toBe(B(v.tokens_out));
          expect(q.completes).toBe(String(v.completes) === "true");
          expect(q.solCharged).toBe(q.solNet + q.fee.total);
          break;
        }
        case "curve_sell": {
          const q = curveSell(P, { realSol: B(v.real_sol), tokensSold: B(v.tokens_sold) }, B(v.tokens_in));
          expect(q.solGross).toBe(B(v.sol_gross));
          expect(q.fee.total).toBe(B(v.fee));
          expect(q.solNet).toBe(B(v.sol_net));
          break;
        }
        case "graduation": {
          const pool = graduationPool(P, { realSol: B(v.real_sol), tokensSold: B(v.tokens_sold) }, B(v.floor_reserve));
          expect(pool.sol).toBe(B(v.pool_sol));
          expect(pool.tok).toBe(B(v.pool_tok));
          break;
        }
        case "pool_buy": {
          const q = poolBuy(P, { sol: B(v.sol), tok: B(v.tok) }, B(v.sol_in));
          expect(q.tokensOut).toBe(B(v.tokens_out));
          expect(q.fee.total).toBe(B(v.fee));
          expect(q.fee.pool).toBe(B(v.pool_fee));
          expect(q.after.sol).toBe(B(v.after_sol));
          expect(q.after.tok).toBe(B(v.after_tok));
          break;
        }
        case "pool_sell": {
          const q = poolSell(P, { sol: B(v.sol), tok: B(v.tok) }, B(v.tokens_in));
          expect(q.solNet).toBe(B(v.sol_net));
          expect(q.fee.total).toBe(B(v.fee));
          expect(q.after.sol).toBe(B(v.after_sol));
          expect(q.after.tok).toBe(B(v.after_tok));
          break;
        }
        case "redeem": {
          const q = redeem(P, { sol: B(v.sol), tok: B(v.tok) }, B(v.queued), B(v.supply), B(v.x));
          expect(q.circulating).toBe(B(v.circulating));
          expect(q.solOut).toBe(B(v.sol_out));
          expect(q.feeKept).toBe(B(v.fee_kept));
          expect(q.poolBurn).toBe(B(v.pool_burn));
          expect(q.after.sol).toBe(B(v.after_sol));
          expect(q.after.tok).toBe(B(v.after_tok));
          expect(q.supplyAfter).toBe(B(v.supply) - B(v.x) - B(v.pool_burn));
          break;
        }
        case "brake_allowed": {
          expect(brakeAllowed(P.brakeDropBps, B(v.ref_sol), B(v.ref_tok), B(v.sol), B(v.tok))).toBe(B(v.allowed));
          break;
        }
        case "queue": {
          let acc = QueueAcc.default();
          const ja = acc.join(B(v.a));
          acc = ja.acc;
          const jb = acc.join(B(v.b));
          acc = jb.acc;
          const f = acc.fill(B(v.sold), B(v.sol_out));
          acc = f.acc;
          expect(f.fill.closedEpoch).toBe(false);
          expect(acc.scale).toBe(B(v.scale));
          expect(acc.solIndex).toBe(B(v.sol_index));
          expect(entryRemaining(ja.position, acc.scale)).toBe(B(v.a_remaining));
          expect(entryRemaining(jb.position, acc.scale)).toBe(B(v.b_remaining));
          expect(entryOwed(ja.position, acc.solIndex)).toBe(B(v.a_owed));
          expect(entryOwed(jb.position, acc.solIndex)).toBe(B(v.b_owed));
          break;
        }
        default:
          throw new Error(`unknown vector op ${v.op}`);
      }
    });
  });

  it("curve vectors chain: each buy starts where the previous one ended", () => {
    const buys = vectors.filter((v) => v.op === "curve_buy");
    for (let i = 1; i < buys.length; i++) {
      const prev = buys[i - 1]!;
      const cur = buys[i]!;
      expect(B(cur.real_sol)).toBe(B(prev.real_sol) + B(prev.sol_net));
      expect(B(cur.tokens_sold)).toBe(B(prev.tokens_sold) + B(prev.tokens_out));
    }
  });
});

describe("core semantics", () => {
  it("default params validate, broken ones throw InvalidParams", () => {
    expect(() => validateParams(P)).not.toThrow();
    expect(() => validateParams({ ...P, brakeDropBps: 0 })).toThrowError(CoreError);
    expect(() => validateParams({ ...P, curveSupply: TOTAL_SUPPLY })).toThrowError(
      expect.objectContaining({ code: "InvalidParams" }),
    );
  });

  it("u128 overflow and division by zero map to CoreError codes", () => {
    expect(() => mulDivFloor(1n << 127n, 2n, 1n)).toThrowError(expect.objectContaining({ code: "Overflow" }));
    expect(() => mulDivCeil(1n, 1n, 0n)).toThrowError(expect.objectContaining({ code: "DivisionByZero" }));
    expect(mulDivCeil(10n, 1n, 3n)).toBe(4n);
    expect(mulDivFloor(10n, 1n, 3n)).toBe(3n);
  });

  it("isqrt is the integer floor square root", () => {
    for (const n of [0n, 1n, 2n, 3n, 4n, 15n, 16n, 17n, 10n ** 30n, (1n << 128n) - 1n]) {
      const r = isqrt(n);
      expect(r * r <= n).toBe(true);
      expect((r + 1n) * (r + 1n) > n).toBe(true);
    }
  });

  it("error variants match the Rust enum", () => {
    expect(() => curveBuy(P, { realSol: 0n, tokensSold: 0n }, 0n)).toThrowError(expect.objectContaining({ code: "ZeroAmount" }));
    expect(() => curveBuy(P, { realSol: P.graduationSol, tokensSold: 0n }, 1_000n)).toThrowError(
      expect.objectContaining({ code: "CurveComplete" }),
    );
    expect(() => curveSell(P, { realSol: 0n, tokensSold: 0n }, 1n)).toThrowError(expect.objectContaining({ code: "ExceedsAvailable" }));
    expect(() => graduationPool(P, { realSol: 0n, tokensSold: 0n }, 0n)).toThrowError(
      expect.objectContaining({ code: "CurveNotComplete" }),
    );
    expect(() => redeem(P, { sol: 1n, tok: TOTAL_SUPPLY }, 0n, TOTAL_SUPPLY, 1n)).toThrowError(
      expect.objectContaining({ code: "NothingInCirculation" }),
    );
    expect(() => QueueAcc.default().join(10n).acc.fill(11n, 1n)).toThrowError(expect.objectContaining({ code: "ExceedsQueue" }));
  });

  it("queue epoch closes when the queue empties, and leave() settles a position", () => {
    const { acc, position } = QueueAcc.default().join(1_000n);
    const f = acc.fill(1_000n, 500n);
    expect(f.fill).toEqual({ closedEpoch: true, finalSolIndex: (500n * SCALE_ONE) / 1_000n, epoch: 0 });
    expect(f.acc.epoch).toBe(1);
    expect(f.acc.scale).toBe(SCALE_ONE);
    expect(entryOwed(position, f.fill.finalSolIndex)).toBe(500n);
    expect(() => f.acc.leave(position)).toThrowError(expect.objectContaining({ code: "InvalidParams" }));

    const j = QueueAcc.default().join(300n);
    const half = j.acc.fill(100n, 50n);
    const l = half.acc.leave(j.position);
    // scale = floor(2^64 · 200 / 300): the remainder rounds down, in favour of the pool (same as Rust)
    expect(l.remaining).toBe(199n);
    expect(l.owed).toBe(49n); // sol_index delta floored too
    expect(l.acc.queuedTotal).toBe(1n);
    // immutability: the original accumulator is untouched
    expect(j.acc.queuedTotal).toBe(300n);
  });

  it("windowStart tiles windows from the anchor", () => {
    expect(windowStart(100n, 150n, 99n)).toBe(100n);
    expect(windowStart(100n, 150n, 249n)).toBe(100n);
    expect(windowStart(100n, 150n, 250n)).toBe(250n);
    expect(windowStart(100n, 150n, 1_000n)).toBe(1_000n);
    expect(windowStart(100n, 150n, 1_049n)).toBe(1_000n);
    expect(windowStart(100n, 150n, 999n)).toBe(850n);
    expect(windowStart(100n, 0n, 1_000n)).toBe(100n);
  });
});
