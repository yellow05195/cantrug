/**
 * 6. Smoke test after a program upgrade: one small swap_buy by alice, then decode every event of
 *    the transaction with the SDK (checks the on-chain event layout matches the IDL the SDK was built from).
 */
import { PublicKey } from "@solana/web3.js";
import { swapBuyIx, parseEvents, formatSol, formatTokens } from "@floored/sdk";
import { connection, coinState, demoWallet, loadState, ensureFunded, send, printFloor } from "./lib.js";

const state = loadState();
if (!state.mint) throw new Error("run `pnpm launch` first");
const mint = new PublicKey(state.mint);
const alice = demoWallet("alice");
const c = await coinState(mint);
const amount = c.params.graduationSol / 850n; // ≈ 0.1 SOL on mainnet numbers, 0.001 SOL on the scaled devnet config
await ensureFunded(alice, Number(amount) / 1e9 + 0.01);
const sig = await send([swapBuyIx({ user: alice.publicKey, mint, solIn: amount, minTokensOut: 0n })], [alice], `smoke swap_buy ${formatSol(amount)} SOL`);
const tx = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
const events = parseEvents(tx?.meta?.logMessages ?? []);
for (const e of events) {
  if (e.name === "Trade") {
    const d = e.data as unknown as Record<string, bigint | boolean | number>;
    console.log(`Trade decoded: isBuy=${d.isBuy} tokens=${formatTokens(d.tokenAmount as bigint)} tokensSold=${formatTokens(d.tokensSold as bigint)} poolSol=${formatSol(d.poolSol as bigint)} queued=${d.queued} timestamp=${d.timestamp}`);
  }
}
if (!events.some((e) => e.name === "Trade")) throw new Error("no Trade event decoded: SDK and program disagree on the event layout");
await printFloor(mint, "after the smoke buy");
process.exit(0);
