/**
 * Server-side RPC connection: the private upstream (UPSTREAM_RPC_URL, e.g. a
 * Helius key) when set, else the public endpoint of the cluster. Browsers never
 * see this URL; they talk to /api/rpc.
 */
import { Connection } from "@solana/web3.js";
import { serverRpcUrl } from "@/lib/env";

let conn: Connection | null = null;
let connUrl = "";

export function serverConnection(): Connection {
  const url = serverRpcUrl();
  if (!conn || connUrl !== url) {
    conn = new Connection(url, { commitment: "confirmed" });
    connUrl = url;
  }
  return conn;
}

/** Run `fn` over `items` with at most `limit` calls in flight. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
