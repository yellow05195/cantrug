export type TxAction =
  | { kind: "buy"; mint: string; symbol: string; lamports: bigint; slippageBps: number }
  | { kind: "sell"; mint: string; symbol: string; tokens: bigint; slippageBps: number; queueRemainder: boolean }
  | { kind: "redeem"; mint: string; symbol: string; tokens: bigint }
  | { kind: "claim"; mint: string; symbol: string }
  | { kind: "cancel"; mint: string; symbol: string }
  | { kind: "queueToRedeem"; mint: string; symbol: string }
  | {
      kind: "create";
      name: string;
      symbol: string;
      uri: string;
      firstBuyLamports: bigint;
      slippageBps: number;
    };

/** What the transaction does, read from the simulated (then confirmed) program events. */
export interface Outcome {
  kind: TxAction["kind"];
  symbol: string;
  /** SOL the wallet pays (buy, create first buy). */
  solIn: bigint;
  /** SOL the wallet receives (sell, redeem, claim). */
  solOut: bigint;
  tokensIn: bigint;
  tokensOut: bigint;
  /** Sell under the brake: part executed now and part queued. */
  executed: bigint;
  queued: bigint;
  /** Tokens held back by the brake and not sold (queueRemainder = false). */
  dropped: bigint;
  /** Exit fee kept in the pool (redeem). */
  feeKept: bigint;
  /** A stale queue position from a closed window was settled first. */
  staleSettledSol: bigint;
  /** New coin mint (create). */
  mint?: string;
}

export function emptyOutcome(kind: TxAction["kind"], symbol: string): Outcome {
  return { kind, symbol, solIn: 0n, solOut: 0n, tokensIn: 0n, tokensOut: 0n, executed: 0n, queued: 0n, dropped: 0n, feeKept: 0n, staleSettledSol: 0n };
}

export interface Prepared {
  outcome: Outcome;
  /** Sends the transaction and resolves with its signature once confirmed. */
  execute: () => Promise<{ signature: string; outcome: Outcome }>;
}
