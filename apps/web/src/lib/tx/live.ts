/**
 * Live transaction path: SDK instruction → compute budget → simulate →
 * parse the simulated program events (exact outcome) → the caller confirms →
 * the wallet signs and sends → confirm → re-read the confirmed events.
 *
 * The two permissionless cranks ride along with ordinary trades, so the site
 * needs no hosted crank to stay correct:
 * - `process_queue` is prepended to a buy or a redeem when a brake window has
 *   closed with tokens still queued (the program serves the queue inside a
 *   sell by itself). The wallet earns the crank reward.
 * - `graduate` is appended to the buy that completes the curve, so the pool
 *   and the floor open in the same transaction as the last curve buy.
 * Both are optional: if the simulation refuses the transaction with them
 * (another wallet cranked first, the window has not closed yet), it is rebuilt
 * without them.
 */
import {
  buyIx,
  buyQuote,
  cancelQueueIx,
  claimQueueIx,
  createCoinTx,
  curveBuy,
  eventsOf,
  graduateIx,
  phase,
  processQueueIx,
  queueToRedeemIx,
  redeemIx,
  sellIx,
  sellQuote,
  setComputeUnitLimit,
  setComputeUnitPrice,
  swapBuyIx,
  swapSellIx,
  windowStart,
  withSlippage,
  type CoinState,
  type FlooredEvent,
} from "@floored/sdk";
import {
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type Connection,
  type TransactionInstruction,
} from "@solana/web3.js";
import { parseFlooredEvents } from "@/lib/chain/events";
import { connection, readConfig, readCoin, readUser } from "@/lib/chain/reads";
import { TxError, errorKey, simulationError } from "./errors";
import { emptyOutcome, type Outcome, type Prepared, type TxAction } from "./types";

/** Priority fee, micro-lamports per CU. Modest: devnet and quiet mainnet slots. */
const PRIORITY_MICRO_LAMPORTS = 20_000;

interface Signer {
  address: string;
  send: (tx: VersionedTransaction, c: Connection) => Promise<string>;
}

interface Built {
  tx: VersionedTransaction;
  events: FlooredEvent[];
  logs: string[];
  blockhash: string;
  lastValidBlockHeight: number;
}

/** A brake window has closed since the last fill and tokens are still queued: `process_queue` would succeed. */
export function queueFillDue(s: CoinState, slot: bigint): boolean {
  if (s.brake.queuedTotal === 0n) return false;
  const len = s.params.brakeWindowSlots;
  return windowStart(s.brake.windowStart, len, slot) > s.brake.windowStart;
}

/** The curve has collected its graduation SOL and the pool is not open yet. */
export function graduationDue(s: CoinState): boolean {
  return phase(s) === "curve" && s.realSol >= s.params.graduationSol;
}

async function buildAndSimulate(c: Connection, payer: PublicKey, ixs: TransactionInstruction[], signers: Keypair[] = []): Promise<Built> {
  const { blockhash, lastValidBlockHeight } = await c.getLatestBlockhash("confirmed");
  const draft = new VersionedTransaction(
    new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: [setComputeUnitLimit(1_400_000), ...ixs] }).compileToV0Message(),
  );
  const sim = await c.simulateTransaction(draft, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
  const logs = sim.value.logs ?? [];
  if (sim.value.err) throw simulationError(sim.value.err, logs);
  const units = sim.value.unitsConsumed ?? 200_000;
  const limit = Math.min(1_400_000, Math.ceil(units * 1.15) + 5_000);
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: [setComputeUnitLimit(limit), setComputeUnitPrice(PRIORITY_MICRO_LAMPORTS), ...ixs],
    }).compileToV0Message(),
  );
  if (signers.length) tx.sign(signers);
  return { tx, events: parseFlooredEvents(logs), logs, blockhash, lastValidBlockHeight };
}

/**
 * Simulate with the optional crank instructions first; if the program refuses
 * (someone else cranked, the window is still open), simulate the bare
 * transaction. The bare transaction's own error is the one reported.
 */
async function buildWithOptional(
  c: Connection,
  payer: PublicKey,
  core: TransactionInstruction[],
  before: TransactionInstruction[],
  after: TransactionInstruction[],
  signers: Keypair[] = [],
): Promise<Built> {
  if (before.length || after.length) {
    try {
      return await buildAndSimulate(c, payer, [...before, ...core, ...after], signers);
    } catch {
      /* fall back to the bare transaction */
    }
  }
  return buildAndSimulate(c, payer, core, signers);
}

function readOutcome(action: TxAction, owner: PublicKey, events: FlooredEvent[], base: Outcome): Outcome {
  const o: Outcome = {
    ...base,
    solIn: 0n,
    solOut: 0n,
    tokensIn: 0n,
    tokensOut: 0n,
    executed: 0n,
    queued: 0n,
    feeKept: 0n,
    staleSettledSol: 0n,
    crankReward: 0n,
    graduated: false,
    queueServed: 0n,
  };
  const mine = <T extends { user: PublicKey }>(xs: T[]) => xs.filter((x) => x.user.equals(owner));
  const trades = mine(eventsOf(events, "Trade")).filter((t) => !t.isQueueFill);
  const settled = mine(eventsOf(events, "QueueSettled"));
  const redeemed = mine(eventsOf(events, "Redeemed"));
  const joined = mine(eventsOf(events, "QueueJoined"));
  // Cranks this wallet performed, alone or on the way.
  for (const p of eventsOf(events, "QueueProcessed")) {
    if (!p.caller.equals(owner)) continue;
    o.crankReward += p.crankReward;
    o.queueServed += p.sold;
  }
  o.graduated = eventsOf(events, "Graduated").some((g) => g.caller.equals(owner));
  switch (action.kind) {
    case "buy":
    case "create": {
      const t = trades.find((x) => x.isBuy);
      if (t) {
        o.solIn = t.solAmount;
        o.tokensOut = t.tokenAmount;
      }
      const created = eventsOf(events, "CoinCreated")[0];
      if (created) o.mint = created.mint.toBase58();
      break;
    }
    case "sell": {
      const t = trades.find((x) => !x.isBuy);
      // A stale position settled in the same transaction (cancel_queue first).
      o.staleSettledSol = settled.reduce((a, s) => a + s.solPaid, 0n);
      if (t) {
        o.solOut = t.solAmount;
        o.executed = t.tokenAmount;
        o.queued = t.queuedRemainder;
      }
      if (!t || t.queuedRemainder === 0n) o.queued = joined.reduce((a, j) => a + j.amount, o.queued);
      o.tokensIn = action.tokens;
      o.dropped = action.tokens - o.executed - o.queued > 0n ? action.tokens - o.executed - o.queued : 0n;
      break;
    }
    case "redeem": {
      const r = redeemed[0];
      if (r) {
        o.solOut = r.solOut;
        o.tokensIn = r.tokensBurned;
        o.feeKept = r.feeKept;
      }
      break;
    }
    case "claim":
    case "cancel":
    case "queueToRedeem": {
      o.solOut = settled.reduce((a, s) => a + s.solPaid, 0n);
      o.tokensOut = settled.reduce((a, s) => a + s.tokensReturned, 0n);
      o.tokensIn = settled.reduce((a, s) => a + s.tokensRedeemed, 0n);
      break;
    }
    case "crank":
    case "graduate":
      // Nothing but the crank fields above.
      break;
  }
  return o;
}

async function confirmedEvents(c: Connection, signature: string): Promise<FlooredEvent[] | null> {
  try {
    const tx = await c.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    return tx?.meta?.logMessages ? parseFlooredEvents(tx.meta.logMessages) : null;
  } catch {
    return null;
  }
}

export async function prepareLive(action: TxAction, signer: Signer): Promise<Prepared> {
  const c = connection();
  const owner = new PublicKey(signer.address);
  const ixs: TransactionInstruction[] = [];
  const before: TransactionInstruction[] = [];
  const after: TransactionInstruction[] = [];
  const extraSigners: Keypair[] = [];
  const symbol = action.symbol;
  let newMint: string | undefined;

  if (action.kind === "create") {
    const config = await readConfig(c);
    if (!config) throw new TxError("configMissing");
    const mintKp = Keypair.generate();
    newMint = mintKp.publicKey.toBase58();
    let firstBuy: { solMax: bigint; minTokensOut: bigint } | undefined;
    if (action.firstBuyLamports > 0n) {
      const q = curveBuy(config.params, { realSol: 0n, tokensSold: 0n }, action.firstBuyLamports);
      firstBuy = { solMax: action.firstBuyLamports, minTokensOut: withSlippage(q.tokensOut, action.slippageBps) };
    }
    const tx = createCoinTx({
      creator: owner,
      protocolFeeRecipient: config.protocolFeeRecipient,
      mint: mintKp.publicKey,
      name: action.name,
      symbol: action.symbol,
      uri: action.uri,
      firstBuy,
      computeUnits: 0,
    });
    ixs.push(...tx.instructions);
    extraSigners.push(mintKp);
  } else {
    const chain = await readCoin(action.mint, c);
    if (!chain) throw new TxError("coinMissing");
    const s = chain.state;
    const mint = new PublicKey(action.mint);
    const user = await readUser(action.mint, signer.address, s, c);
    const fillDue = queueFillDue(s, chain.slot);
    switch (action.kind) {
      case "buy": {
        if (fillDue) before.push(processQueueIx({ caller: owner, mint, epoch: s.brake.epoch }));
        const q = buyQuote(s, action.lamports);
        const minTokensOut = withSlippage(q.tokensOut, action.slippageBps);
        ixs.push(
          phase(s) === "curve"
            ? buyIx({ user: owner, mint, solMax: action.lamports, minTokensOut })
            : swapBuyIx({ user: owner, mint, solIn: action.lamports, minTokensOut }),
        );
        // The buy that completes the curve opens the pool in the same transaction.
        if (q.venue === "curve" && q.completes) after.push(graduateIx({ caller: owner, mint }));
        break;
      }
      case "sell": {
        // A position left over from a closed window must be settled before a new sale can queue.
        if (user.queueEntry && user.queueEntry.epoch !== s.brake.epoch) {
          ixs.push(cancelQueueIx({ user: owner, mint, entryEpoch: user.queueEntry.epoch }));
        }
        const q = sellQuote(s, action.tokens, chain.slot);
        const minSolOut = q.quote ? withSlippage(q.quote.solNet, action.slippageBps) : 0n;
        const args = { user: owner, mint, epoch: s.brake.epoch, tokensIn: action.tokens, minSolOut, queueRemainder: action.queueRemainder };
        ixs.push(phase(s) === "curve" ? sellIx(args) : swapSellIx(args));
        break;
      }
      case "redeem":
        if (fillDue) before.push(processQueueIx({ caller: owner, mint, epoch: s.brake.epoch }));
        ixs.push(redeemIx({ user: owner, mint, tokens: action.tokens }));
        break;
      case "claim":
      case "cancel":
      case "queueToRedeem": {
        if (!user.queueEntry) throw new TxError("program.NotQueued");
        const a = { user: owner, mint, entryEpoch: user.queueEntry.epoch };
        ixs.push(action.kind === "claim" ? claimQueueIx(a) : action.kind === "cancel" ? cancelQueueIx(a) : queueToRedeemIx(a));
        break;
      }
      case "crank":
        if (s.brake.queuedTotal === 0n) throw new TxError("program.QueueEmpty");
        if (!fillDue) throw new TxError("program.WindowNotElapsed");
        ixs.push(processQueueIx({ caller: owner, mint, epoch: s.brake.epoch }));
        break;
      case "graduate":
        if (phase(s) !== "curve") throw new TxError("program.WrongPhase");
        if (!graduationDue(s)) throw new TxError("program.CurveNotComplete");
        ixs.push(graduateIx({ caller: owner, mint }));
        break;
    }
  }

  const built = await buildWithOptional(c, owner, ixs, before, after, extraSigners);
  const base = emptyOutcome(action.kind, symbol);
  const outcome = readOutcome(action, owner, built.events, base);
  if (newMint && !outcome.mint) outcome.mint = newMint;

  return {
    outcome,
    execute: async () => {
      let signature: string;
      try {
        signature = await signer.send(built.tx, c);
      } catch (e) {
        throw new TxError(errorKey(e));
      }
      const res = await c.confirmTransaction({ signature, blockhash: built.blockhash, lastValidBlockHeight: built.lastValidBlockHeight }, "confirmed");
      if (res.value.err) throw new TxError(errorKey(res.value.err));
      const confirmed = await confirmedEvents(c, signature);
      const final = confirmed ? readOutcome(action, owner, confirmed, outcome) : outcome;
      if (newMint && !final.mint) final.mint = newMint;
      return { signature, outcome: final };
    },
  };
}
