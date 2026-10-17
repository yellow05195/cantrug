/**
 * 2. Launch the demo coin, buy it to graduation with a few wallets, graduate it (permissionless crank).
 *    Devnet SOL needed: ~95 SOL in the deployer (85 SOL curve + fees + rent). Fund it with
 *    several `solana airdrop` calls or set DEPLOYER to a funded keypair.
 */
import { Keypair } from "@solana/web3.js";
import { buyIx, createCoinTx, graduateIx, coinKeys } from "@floored/sdk";
import { connection, deployer, demoWallet, ensureFunded, loadState, saveState, send, printFloor, coinState, config, LAMPORTS_PER_SOL } from "./lib.js";

const state = loadState();
const cfg = await config();
if (!cfg) throw new Error("run `pnpm init-config` first");

let mint: Keypair | null = null;
if (!state.mint) {
  mint = Keypair.generate();
  const tx = createCoinTx({
    creator: deployer.publicKey,
    protocolFeeRecipient: cfg.protocolFeeRecipient,
    mint: mint.publicKey,
    name: "Floored Demo",
    symbol: "FLRD",
    uri: "https://floored.fun/meta/demo.json",
    firstBuy: { solMax: cfg.params.graduationSol / 85n, minTokensOut: 0n },
  });
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.sign(deployer, mint);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await connection.confirmTransaction(sig, "confirmed");
  console.log("✔ create_coin + first buy", sig, "mint", mint.publicKey.toBase58());
  state.mint = mint.publicKey.toBase58();
  state.creator = deployer.publicKey.toBase58();
  state.signatures.create = [sig];
  saveState(state);
}
const mintPk = new (await import("@solana/web3.js")).PublicKey(state.mint!);
console.log("coin", coinKeys(mintPk).coin.toBase58(), "mint", mintPk.toBase58());
await printFloor(mintPk, "after creation");

// Three buyers push the curve to graduation. The "dev" wallet ends up with ~30 % of the supply.
const dev = demoWallet("dev");
const alice = demoWallet("alice");
const bob = demoWallet("bob");
state.dev = dev.publicKey.toBase58();
state.buyers = [alice.publicKey.toBase58(), bob.publicKey.toBase58()];
saveState(state);
const G = Number(cfg.params.graduationSol) / LAMPORTS_PER_SOL; // SOL to graduate (85 on mainnet, 0.85 on the scaled devnet config)
const deployerBal = (await connection.getBalance(deployer.publicKey)) / LAMPORTS_PER_SOL;
console.log(`deployer balance ${deployerBal.toFixed(3)} SOL, curve needs ${G} SOL`);
if (deployerBal < G * 1.1) console.warn("⚠ not enough SOL for the whole curve; the script stops when the deployer runs dry. Re-run after funding.");

// Fractions of the graduation amount: the dev ends up with ~40 % of what the curve sold.
const plan: [Keypair, number][] = [
  [dev, 0.24],
  [alice, 0.12],
  [bob, 0.12],
  [dev, 0.18],
  [alice, 0.12],
  [bob, 0.12],
  [dev, 0.06],
  [alice, 0.12],
].map(([k, f]) => [k as Keypair, Math.round(G * (f as number) * 1000) / 1000]);
state.signatures.buys ??= [];
for (const [who, sol] of plan) {
  const c = await coinState(mintPk);
  if (c.phase === 1 || c.realSol >= c.params.graduationSol) break;
  await ensureFunded(who, sol + 0.02);
  const sig = await send([buyIx({ user: who.publicKey, mint: mintPk, solMax: BigInt(Math.round(sol * LAMPORTS_PER_SOL)), minTokensOut: 0n })], [who], `buy ${sol} SOL by ${who.publicKey.toBase58().slice(0, 6)}`);
  state.signatures.buys.push(sig);
  saveState(state);
}
await printFloor(mintPk, "curve complete");

const c = await coinState(mintPk);
if (c.phase === 0 && c.realSol >= c.params.graduationSol) {
  const sig = await send([graduateIx({ caller: bob.publicKey, mint: mintPk })], [bob], "graduate (crank by bob, earns the crank reward)");
  state.signatures.graduate = [sig];
  saveState(state);
}
await printFloor(mintPk, "graduated: the floor is live");

// web3 keeps a websocket open; exit explicitly once the script is done.
process.exit(0);
