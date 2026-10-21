/**
 * 8. Push every coin's owed protocol fees to the recipient stored in config.
 *    Permissionless on-chain; the deployer only pays the transaction fees.
 *    DRY_RUN=1 lists what is owed without sending. RPC_URL / DEPLOYER as for the other scripts.
 */
import { Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { ACCOUNT_SIZES, PROGRAM_ID, claimProtocolFeesIx, decodeCoinState } from "@floored/sdk";
import { config, connection, deployer, LAMPORTS_PER_SOL, RPC } from "./lib.js";

const dry = process.env.DRY_RUN === "1";
const c = await config();
if (!c) throw new Error("config not initialized on " + RPC);
const recipient = c.protocolFeeRecipient;
console.log("protocol fees to", recipient.toBase58(), dry ? "(dry run)" : "");

const accounts = await connection.getProgramAccounts(PROGRAM_ID, { filters: [{ dataSize: ACCOUNT_SIZES.CoinState }] });
let total = 0n;
let claimed = 0n;
for (const a of accounts) {
  let s;
  try {
    s = decodeCoinState(new Uint8Array(a.account.data));
  } catch {
    continue;
  }
  if (s.protocolFeesOwed === 0n) continue;
  total += s.protocolFeesOwed;
  console.log(s.mint.toBase58(), Number(s.protocolFeesOwed) / LAMPORTS_PER_SOL, "SOL");
  if (dry) continue;
  try {
    const tx = new Transaction().add(claimProtocolFeesIx({ caller: deployer.publicKey, mint: s.mint, protocolFeeRecipient: recipient }));
    const sig = await sendAndConfirmTransaction(connection, tx, [deployer]);
    claimed += s.protocolFeesOwed;
    console.log("  claimed", sig);
  } catch (e) {
    console.log("  failed:", (e as Error).message);
  }
}
console.log(`coins ${accounts.length}, owed ${Number(total) / LAMPORTS_PER_SOL} SOL, claimed ${Number(claimed) / LAMPORTS_PER_SOL} SOL`);
