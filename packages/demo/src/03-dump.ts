/**
 * 3. The rug-proof challenge: the dev dumps everything at once.
 *    Only the window allowance executes (price −20 % at most), the rest is queued.
 *    Then: a crank serves the queue window after window; alice buys into the dip (never braked);
 *    the dev finally switches the rest of the queue to the floor.
 */
import { PublicKey } from "@solana/web3.js";
import { swapSellIx, swapBuyIx, processQueueIx, queueToRedeemIx, sellQuote, formatTokens, formatSol } from "@floored/sdk";
import { coinState, demoWallet, loadState, saveState, send, printFloor, tokenBalance, queueEntry, slot, supplyOf, ensureFunded, LAMPORTS_PER_SOL } from "./lib.js";

const state = loadState();
if (!state.mint) throw new Error("run `pnpm launch` first");
const mint = new PublicKey(state.mint);
const dev = demoWallet("dev");
const alice = demoWallet("alice");
const bob = demoWallet("bob");

let c = await coinState(mint);
if (c.phase !== 1) throw new Error("coin not graduated");
const bag = await tokenBalance(dev.publicKey, mint);
const supply = await supplyOf(mint);
console.log(`dev holds ${formatTokens(bag)} tokens = ${(Number(bag) / Number(supply) * 100).toFixed(1)} % of supply`);
await printFloor(mint, "before the dump");

const q = sellQuote(c, bag, await slot());
console.log(`quote: ${formatTokens(q.executed)} execute now for ${formatSol(q.quote?.solNet ?? 0n)} SOL, ${formatTokens(q.braked)} would be queued`);

state.signatures.dump ??= [];
const sig = await send(
  [swapSellIx({ user: dev.publicKey, mint, epoch: c.brake.epoch, tokensIn: bag, minSolOut: 0n, queueRemainder: true })],
  [dev],
  "DEV DUMPS 100 % of the bag (brake engages)",
);
state.signatures.dump.push(sig);
saveState(state);
await printFloor(mint, "right after the dump");

// Alice buys the dip: buys are never braked.
const dip = c.params.graduationSol / 40n; // ≈ 2 SOL on mainnet numbers
await ensureFunded(alice, Number(dip) / LAMPORTS_PER_SOL + 0.02);
state.signatures.dump.push(await send([swapBuyIx({ user: alice.publicKey, mint, solIn: dip, minTokensOut: 0n })], [alice], `alice buys ${formatSol(dip)} SOL into the dip`));

// The crank serves the queue, one window at a time (150 slots ≈ 60 s).
await ensureFunded(bob, 0.02);
for (let w = 0; w < 3; w++) {
  c = await coinState(mint);
  if (c.brake.queuedTotal === 0n) break;
  const now = await slot();
  const nextWindow = c.brake.windowStart + c.params.brakeWindowSlots;
  if (now < nextWindow) {
    const wait = Number(nextWindow - now) * 0.4 + 2;
    console.log(`   waiting ${wait.toFixed(0)} s for the next window…`);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  try {
    state.signatures.dump.push(await send([processQueueIx({ caller: bob.publicKey, mint, epoch: c.brake.epoch })], [bob], `process_queue window ${w + 1}`));
  } catch (e) {
    console.log("   process_queue:", (e as Error).message.split("\n")[0]);
  }
  saveState(state);
  await printFloor(mint, `after window ${w + 1}`);
  const e = await queueEntry(mint, dev.publicKey);
  if (e) console.log(`   dev queue entry: epoch ${e.epoch}, queued ${formatTokens(e.amountQueued)}`);
}

// The dev gives up waiting and exits the queue at the floor.
const entry = await queueEntry(mint, dev.publicKey);
if (entry) {
  state.signatures.dump.push(await send([queueToRedeemIx({ user: dev.publicKey, mint, entryEpoch: entry.epoch })], [dev], "dev switches the queued rest to the floor (instant)"));
  saveState(state);
}
await printFloor(mint, "after the dev left at the floor");

// web3 keeps a websocket open; exit explicitly once the script is done.
process.exit(0);
