/**
 * Same-origin JSON-RPC proxy: the browser talks to /api/rpc, the server talks
 * to UPSTREAM_RPC_URL (a private Helius key, never shipped to the client) or to
 * the public cluster endpoint. Read methods and the two send methods only, batch
 * requests capped, a small per-IP throttle. No websocket: the site confirms by
 * polling getSignatureStatuses and streams through /api/events.
 *
 * `?cluster=devnet` reads devnet instead (the rug-proof challenge replays a devnet
 * episode on the mainnet site): DEVNET_RPC_URL, else the public devnet endpoint;
 * read methods only, nothing can be sent there.
 */
import { serverRpcUrl } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "getAccountInfo",
  "getMultipleAccounts",
  "getBalance",
  "getSlot",
  "getBlockHeight",
  "getEpochInfo",
  "getLatestBlockhash",
  "isBlockhashValid",
  "getFeeForMessage",
  "getRecentPrioritizationFees",
  "getMinimumBalanceForRentExemption",
  "getSignatureStatuses",
  "getSignaturesForAddress",
  "getTransaction",
  "getTokenAccountBalance",
  "getTokenAccountsByOwner",
  "getTokenLargestAccounts",
  "getTokenSupply",
  "simulateTransaction",
  "sendTransaction",
  "getVersion",
  "getHealth",
]);
const DEVNET_BLOCKED = new Set(["sendTransaction", "simulateTransaction"]);
const MAX_BATCH = 20;
const MAX_BODY = 256 * 1024;
const LIMIT = 240; // requests per window per IP
const WINDOW_MS = 10_000;

const hits = new Map<string, { n: number; at: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > WINDOW_MS) {
    if (hits.size > 5000) hits.clear();
    hits.set(ip, { n: 1, at: now });
    return false;
  }
  h.n++;
  return h.n > LIMIT;
}

const err = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

function ipOf(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || req.headers.get("x-real-ip") || "local";
}

export async function POST(req: Request): Promise<Response> {
  if (limited(ipOf(req))) return reply(err(null, -32005, "too many requests"), 429);
  const text = await req.text();
  if (text.length > MAX_BODY) return reply(err(null, -32600, "body too large"), 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply(err(null, -32700, "parse error"), 400);
  }
  const devnet = new URL(req.url).searchParams.get("cluster") === "devnet";
  const calls = Array.isArray(body) ? body : [body];
  if (calls.length === 0 || calls.length > MAX_BATCH) return reply(err(null, -32600, "bad batch size"), 400);
  for (const c of calls) {
    const method = (c as { method?: unknown })?.method;
    if (typeof method !== "string" || !ALLOWED.has(method) || (devnet && DEVNET_BLOCKED.has(method))) return reply(err((c as { id?: unknown })?.id, -32601, `method not allowed: ${String(method)}`), 403);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const upstream = devnet ? (process.env.DEVNET_RPC_URL ?? "").trim() || "https://api.devnet.solana.com" : serverRpcUrl();
    const up = await fetch(upstream, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: text,
      signal: ctrl.signal,
      cache: "no-store",
    });
    const out = await up.text();
    return new Response(out, { status: up.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch (e) {
    return reply(err(null, -32000, `upstream unreachable: ${e instanceof Error ? e.message : String(e)}`), 502);
  } finally {
    clearTimeout(timer);
  }
}

export function GET(): Response {
  return reply({ ok: true, proxy: "solana-json-rpc", methods: [...ALLOWED] });
}
