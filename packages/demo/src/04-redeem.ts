/**
 * 4. Everyone redeems at the floor: alice half, bob everything, then alice the rest.
 *    Shows: exact payout S·x/C − 0.5 %, floor non-decreasing for the others, last holder takes all.
 */
import { PublicKey } from "@solana/web3.js";
import { redeemIx, redeemQuote, formatSol, formatTokens } from "@floored/sdk";
import { coinState, demoWallet, loadState, saveState, send, printFloor, tokenBalance, supplyOf, connection } from "./lib.js";

const state = loadState();
if (!state.mint) throw new Error("run `pnpm launch` first");
const mint = new PublicKey(state.mint);
const alice = demoWallet("alice");
const bob = demoWallet("bob");
state.signatures.redeem ??= [];

async function redeem(who: typeof alice, fraction: number, label: string) {
  const bag = await tokenBalance(who.publicKey, mint);
  if (bag === 0n) return;
  const x = fraction >= 1 ? bag : (bag * BigInt(Math.round(fraction * 1000))) / 1000n;
  const c = await coinState(mint);
  const supply = await supplyOf(mint);
  const q = redeemQuote(c, supply, x);
  const before = await connection.getBalance(who.publicKey);
  const sig = await send([redeemIx({ user: who.publicKey, mint, tokens: x })], [who], `${label}: redeem ${formatTokens(x)} tokens, quote ${formatSol(q.solOut)} SOL`);
  const after = await connection.getBalance(who.publicKey);
  console.log(`   received ${formatSol(BigInt(after - before + 5000))} SOL (quote ${formatSol(q.solOut)}, fee kept in pool ${formatSol(q.feeKept)})`);
  state.signatures.redeem.push(sig);
  saveState(state);
  await printFloor(mint, `after ${label}`);
}

await printFloor(mint, "before redemptions");
await redeem(alice, 0.5, "alice half");
await redeem(bob, 1, "bob all");
await redeem(alice, 1, "alice rest");
console.log("\nsignatures:", JSON.stringify(state.signatures, null, 2));

// web3 keeps a websocket open; exit explicitly once the script is done.
process.exit(0);
