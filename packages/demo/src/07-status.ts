/**
 * 7. Status of a cluster: deployer balance, config, number of coins. Read only.
 *    RPC_URL / DEPLOYER as for the other scripts.
 */
import { ACCOUNT_SIZES, PROGRAM_ID, decodeCoinState, phase } from "@floored/sdk";
import { config, connection, deployer, LAMPORTS_PER_SOL, RPC } from "./lib.js";

console.log("rpc       ", RPC);
console.log("program   ", PROGRAM_ID.toBase58());
const info = await connection.getAccountInfo(PROGRAM_ID);
console.log("deployed  ", info ? `yes (${info.executable ? "executable" : "not executable"}, owner ${info.owner.toBase58()})` : "no");
console.log("deployer  ", deployer.publicKey.toBase58(), (await connection.getBalance(deployer.publicKey)) / LAMPORTS_PER_SOL, "SOL");
const c = await config();
if (!c) {
  console.log("config     not initialized");
} else {
  console.log("config     authority", c.authority.toBase58());
  console.log("           protocol fees to", c.protocolFeeRecipient.toBase58());
  console.log("           graduation", Number(c.params.graduationSol) / 1e9, "SOL, virtual", Number(c.params.virtualSol) / 1e9, "SOL");
  console.log("           create fee", Number(c.createFee) / 1e9, "SOL, crank reward", Number(c.crankReward) / 1e9, "SOL");
  console.log("           coins", c.coinsCreated.toString(), "graduated", c.coinsGraduated.toString(), "redeemed", Number(c.totalRedeemedSol) / 1e9, "SOL in", c.totalRedeems.toString(), "redeems");
}
if (info) {
  const coins = await connection.getProgramAccounts(PROGRAM_ID, { filters: [{ dataSize: ACCOUNT_SIZES.CoinState }] });
  let curve = 0;
  let graduated = 0;
  let queued = 0;
  for (const a of coins) {
    try {
      const s = decodeCoinState(new Uint8Array(a.account.data));
      if (phase(s) === "curve") curve++;
      else graduated++;
      if (s.brake.queuedTotal > 0n) queued++;
    } catch {
      /* other account of the same size */
    }
  }
  console.log("coins      on curve", curve, "graduated", graduated, "with a queue", queued);
}
