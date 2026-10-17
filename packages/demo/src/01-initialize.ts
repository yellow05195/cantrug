/**
 * 1. Initialize the GlobalConfig on devnet (once). Defaults = floored-core Params::DEFAULT,
 *    crank reward 0.002 SOL, creation fee 0.02 SOL, protocol fee recipient = deployer.
 */
import { DEFAULT_PARAMS, initializeIx } from "@floored/sdk";
import { config, deployer, send, connection, LAMPORTS_PER_SOL } from "./lib.js";

/**
 * Devnet faucets hand out a couple of SOL, not the 85 SOL a mainnet curve collects, so the
 * devnet config scales the SOL side of the curve down 100× (0.3 virtual SOL, 0.85 SOL to
 * graduate: same 30:85 ratio, same token numbers, same fees, same brake). Set DEMO_SCALE=1
 * to initialise with the mainnet defaults.
 */
const scale = Number(process.env.DEMO_SCALE ?? "100");
const params = {
  ...DEFAULT_PARAMS,
  virtualSol: DEFAULT_PARAMS.virtualSol / BigInt(scale),
  graduationSol: DEFAULT_PARAMS.graduationSol / BigInt(scale),
};

const existing = await config();
if (existing) {
  console.log("config already initialized; authority", existing.authority.toBase58());
  process.exit(0);
}
console.log("deployer", deployer.publicKey.toBase58(), "balance", (await connection.getBalance(deployer.publicKey)) / LAMPORTS_PER_SOL, "SOL");
await send(
  [
    initializeIx({
      authority: deployer.publicKey,
      params,
      crankReward: 2_000_000n / BigInt(scale),
      createFee: 20_000_000n / BigInt(scale),
      protocolFeeRecipient: deployer.publicKey,
    }),
  ],
  [deployer],
  `initialize (scale 1/${scale}: ${Number(params.graduationSol) / 1e9} SOL to graduate)`,
);
const c = await config();
console.log("config", { coinsCreated: c?.coinsCreated.toString(), crankReward: c?.crankReward.toString(), createFee: c?.createFee.toString() });
