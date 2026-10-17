/**
 * 5. Verify the floor of any coin yourself, from raw reads only (no SDK math):
 *    three accounts, one division. `pnpm verify <mint>`
 */
import { PublicKey } from "@solana/web3.js";
import { coinKeys } from "@floored/sdk";
import { connection, loadState } from "./lib.js";

const arg = process.argv[2] ?? loadState().mint;
if (!arg) throw new Error("usage: pnpm verify <mint>");
const mint = new PublicKey(arg);
const k = coinKeys(mint);

const [solVault, rent, tokVault, supply, escrow] = await Promise.all([
  connection.getBalance(k.poolSolVault),
  connection.getMinimumBalanceForRentExemption(0),
  connection.getTokenAccountBalance(k.poolTokenVault).then((b) => BigInt(b.value.amount)),
  connection.getTokenSupply(mint).then((s) => BigInt(s.value.amount)),
  connection.getTokenAccountBalance(k.queueEscrow).then((b) => BigInt(b.value.amount)),
]);
const S = BigInt(solVault - rent);
const T = tokVault;
const Q = escrow; // upper bound of the queue (dust may remain in the escrow)
const C = supply - T - Q;
console.log(`mint        ${mint.toBase58()}`);
console.log(`pool SOL  S ${S} lamports      (balance of ${k.poolSolVault.toBase58()} minus rent)`);
console.log(`pool tok  T ${T} base units    (amount of ${k.poolTokenVault.toBase58()})`);
console.log(`queued    Q ${Q} base units    (amount of ${k.queueEscrow.toBase58()})`);
console.log(`supply      ${supply}`);
console.log(`C = supply − T − Q = ${C}`);
if (C > 0n) {
  const floor = Number(S) / 1e9 / (Number(C) / 1e6);
  const price = T > 0n ? Number(S) / 1e9 / (Number(T) / 1e6) : 0;
  console.log(`floor = S / C = ${floor.toExponential(6)} SOL per token`);
  console.log(`price = S / T = ${price.toExponential(6)} SOL per token`);
  console.log(`a holder of 1 000 000 tokens can redeem ≥ ${((floor * 1e6) * 0.995).toFixed(6)} SOL right now (0.5 % stays in the pool)`);
} else {
  console.log("nothing in circulation");
}

// web3 keeps a websocket open; exit explicitly once the script is done.
process.exit(0);
