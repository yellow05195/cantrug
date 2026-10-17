/**
 * The rug-proof challenge replays a recorded devnet episode (the FLRD demo
 * coin). When the site itself runs on mainnet, that replay must keep reading
 * devnet, so it gets its own connection:
 * - `NEXT_PUBLIC_CHALLENGE_RPC_URL` when set (any devnet RPC, Helius devnet works with the same key);
 * - otherwise the site's own connection when the site is on devnet;
 * - otherwise the public devnet RPC.
 */
import { Connection } from "@solana/web3.js";
import { ENV } from "@/lib/env";
import { connection } from "./reads";

const PUBLIC_DEVNET = "https://api.devnet.solana.com";
const explicit = (process.env.NEXT_PUBLIC_CHALLENGE_RPC_URL ?? "").trim();

let conn: Connection | null = null;

/** Connection to the cluster the challenge coin lives on. */
export function challengeConnection(): Connection {
  if (explicit) {
    if (!conn) conn = new Connection(explicit, { commitment: "confirmed" });
    return conn;
  }
  if (ENV.isDevnet) return connection();
  if (!conn) conn = new Connection(PUBLIC_DEVNET, { commitment: "confirmed" });
  return conn;
}

/** True when the challenge coin is read from a different cluster than the site (explorer links must say so). */
export const challengeOnOtherCluster = Boolean(explicit) || !ENV.isDevnet;
