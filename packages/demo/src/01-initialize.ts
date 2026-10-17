/**
 * 1. Initialize the GlobalConfig (once per cluster). Defaults = floored-core Params::DEFAULT,
 *    crank reward 0.002 SOL, creation fee 0.02 SOL.
 *
 * Env:
 *   RPC_URL                  cluster (default devnet)
 *   DEPLOYER                 keypair that becomes the config authority (default keys/floored-devnet.json)
 *   DEMO_SCALE               divide the SOL side of the curve by this (default 100 for devnet faucets; 1 = mainnet defaults)
 *   PROTOCOL_FEE_RECIPIENT   wallet that receives protocol fees (default: the deployer)
 */
import { DEFAULT_PARAMS, initializeIx } from "@floored/sdk";
import { PublicKey } from "@solana/web3.js";
import { config, deployer, send, connection, LAMPORTS_PER_SOL, RPC } from "./lib.js";

/**
 * Devnet faucets hand out a couple of SOL, not the 85 SOL a mainnet curve collects, so the
 * devnet config scales the SOL side of the curve down 100× (0.3 virtual SOL, 0.85 SOL to
 * graduate: same 30:85 ratio, same token numbers, same fees, same brake). Set DEMO_SCALE=1
 * to initialise with the mainnet defaults.
 */
const scale = Number(process.env.DEMO_SCALE ?? "100");
if (!Number.isInteger(scale) || scale < 1) throw new Error("DEMO_SCALE must be a positive integer");
const params = {
  ...DEFAULT_PARAMS,
  virtualSol: DEFAULT_PARAMS.virtualSol / BigInt(scale),
  graduationSol: DEFAULT_PARAMS.graduationSol / BigInt(scale),
};
const feeRecipient = process.env.PROTOCOL_FEE_RECIPIENT ? new PublicKey(process.env.PROTOCOL_FEE_RECIPIENT) : deployer.publicKey;

const existing = await config();
if (existing) {
  console.log("config already initialized on", RPC);
  console.log("  authority           ", existing.authority.toBase58());
  console.log("  protocol fee to     ", existing.protocolFeeRecipient.toBase58());
  console.log("  graduation SOL      ", Number(existing.params.graduationSol) / 1e9);
  console.log("  virtual SOL         ", Number(existing.params.virtualSol) / 1e9);
  console.log("  create fee SOL      ", Number(existing.createFee) / 1e9);
  console.log("  crank reward SOL    ", Number(existing.crankReward) / 1e9);
  console.log("  coins created       ", existing.coinsCreated.toString());
  process.exit(0);
}
console.log("rpc", RPC);
console.log("deployer", deployer.publicKey.toBase58(), "balance", (await connection.getBalance(deployer.publicKey)) / LAMPORTS_PER_SOL, "SOL");
console.log("protocol fee recipient", feeRecipient.toBase58());
await send(
  [
    initializeIx({
      authority: deployer.publicKey,
      params,
      crankReward: 2_000_000n / BigInt(scale),
      createFee: 20_000_000n / BigInt(scale),
      protocolFeeRecipient: feeRecipient,
    }),
  ],
  [deployer],
  `initialize (scale 1/${scale}: ${Number(params.graduationSol) / 1e9} SOL to graduate)`,
);
const c = await config();
console.log("config", {
  coinsCreated: c?.coinsCreated.toString(),
  crankReward: c?.crankReward.toString(),
  createFee: c?.createFee.toString(),
  protocolFeeRecipient: c?.protocolFeeRecipient.toBase58(),
});
