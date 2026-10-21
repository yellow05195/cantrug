/**
 * 9. Preflight: simulate create_coin + a 0.1 SOL first buy against the cluster.
 * Nothing is sent and nothing is spent. RPC_URL / DEPLOYER as for the other scripts.
 */
import { Keypair, VersionedTransaction, TransactionMessage } from "@solana/web3.js";
import { createCoinTx } from "@floored/sdk";
import { config, connection, deployer, LAMPORTS_PER_SOL, RPC } from "./lib.js";

const cfg = await config();
if (!cfg) throw new Error("config not initialized on " + RPC);
const mint = Keypair.generate();
const tx = createCoinTx({
  creator: deployer.publicKey,
  protocolFeeRecipient: cfg.protocolFeeRecipient,
  mint: mint.publicKey,
  name: "Preflight",
  symbol: "PRE",
  uri: "https://cantrug.xyz/meta/preflight.json",
  firstBuy: { solMax: BigInt(0.1 * LAMPORTS_PER_SOL), minTokensOut: 0n },
});
const { blockhash } = await connection.getLatestBlockhash();
const msg = new TransactionMessage({ payerKey: deployer.publicKey, recentBlockhash: blockhash, instructions: tx.instructions }).compileToV0Message();
const vtx = new VersionedTransaction(msg);
vtx.sign([deployer, mint]);
const sim = await connection.simulateTransaction(vtx, { sigVerify: true, commitment: "confirmed" });
console.log("rpc  ", RPC);
console.log("units", sim.value.unitsConsumed, "err", JSON.stringify(sim.value.err));
for (const l of (sim.value.logs ?? []).filter((l) => /Program log|failed|success|consumed/.test(l)).slice(-12)) console.log("  ", l);
if (sim.value.err) process.exit(1);
console.log("✔ create_coin + first buy simulate cleanly");
