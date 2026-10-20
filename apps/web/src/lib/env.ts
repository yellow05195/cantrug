/**
 * Public runtime configuration. Every NEXT_PUBLIC_* value is inlined at build
 * time by Next; the server-only values (UPSTREAM_RPC_URL) are read at runtime.
 *
 * Data modes (NEXT_PUBLIC_DATA, or inferred):
 * - "mock":    in-memory dataset, mock websocket, mock chain (demo site, no RPC);
 * - "indexer": apps/indexer at NEXT_PUBLIC_API_URL (REST under /api, websocket at /ws);
 * - "chain":   no indexer: the site's own route handlers (apps/web/src/app/api) read
 *              the program's accounts and transaction history through the server RPC
 *              and serve the same JSON as the indexer; live updates come from polling.
 */

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
const mockFlag = process.env.NEXT_PUBLIC_MOCK;
const rawRpc = (process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com").trim();

export type DataMode = "mock" | "indexer" | "chain";
export type Cluster = "devnet" | "mainnet-beta" | "testnet";

const PUBLIC_RPC: Record<Cluster, string> = {
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  testnet: "https://api.testnet.solana.com",
};

const isServer = typeof window === "undefined";
/** True when NEXT_PUBLIC_RPC_URL is a same-origin path such as "/api/rpc" (the server proxy). */
const rpcIsRelative = rawRpc.startsWith("/");

function inferCluster(): Cluster {
  const explicit = process.env.NEXT_PUBLIC_CLUSTER as Cluster | undefined;
  if (explicit === "devnet" || explicit === "mainnet-beta" || explicit === "testnet") return explicit;
  const probe = rpcIsRelative ? (isServer ? process.env.UPSTREAM_RPC_URL ?? "" : "") : rawRpc;
  if (/devnet/i.test(probe)) return "devnet";
  if (/testnet/i.test(probe)) return "testnet";
  if (/mainnet/i.test(probe)) return "mainnet-beta";
  // A proxied RPC without an explicit cluster is the production setup.
  return rpcIsRelative ? "mainnet-beta" : "devnet";
}
const cluster = inferCluster();

function inferDataMode(): DataMode {
  const explicit = (process.env.NEXT_PUBLIC_DATA ?? "").trim().toLowerCase();
  if (explicit === "mock" || explicit === "indexer" || explicit === "chain") return explicit;
  if (mockFlag === "1" || mockFlag === "true") return "mock";
  if (apiUrl !== "") return "indexer";
  if (mockFlag === "0" || mockFlag === "false") return "chain";
  return "mock";
}
const data = inferDataMode();

/** The RPC the server uses: the private upstream (Helius) when set, else the public cluster endpoint. */
export function serverRpcUrl(): string {
  const up = (process.env.UPSTREAM_RPC_URL ?? "").trim();
  if (up) return up;
  return rpcIsRelative ? PUBLIC_RPC[cluster] : rawRpc;
}

/**
 * The RPC URL web3.js can use in the current runtime. A relative
 * NEXT_PUBLIC_RPC_URL ("/api/rpc") becomes `${origin}/api/rpc` in the browser
 * and the upstream URL on the server (SSR reads never go through the proxy).
 */
function resolveRpcUrl(): string {
  if (!rpcIsRelative) return rawRpc;
  if (isServer) return serverRpcUrl();
  return `${window.location.origin}${rawRpc}`;
}
const rpcUrl = resolveRpcUrl();

export const DEVNET_DEMO_MINT = "7PwqFN6yrgWQDim5RFR4au4znTbr2NBGH6ND1JQgFVYY";
export const DEVNET_DEMO_DEV = "5rA2GzrTpitKbeeuK9EPzvZR1TaCGZ5feZ2PhJmJ7evE";

export const ENV = {
  /** Indexer origin, e.g. https://api.floored.fun (REST under /api, websocket at /ws). Empty in chain mode. */
  apiUrl,
  /** Where lists, feeds, candles and stats come from. */
  data,
  /** Mock mode: in-memory dataset + mock websocket + mock chain. */
  mock: data === "mock",
  /** Chain mode: the site's own /api route handlers, no indexer. */
  chain: data === "chain",
  rpcUrl,
  /** NEXT_PUBLIC_RPC_URL as written ("/api/rpc" when proxied). */
  rpcPath: rawRpc,
  rpcProxied: rpcIsRelative,
  cluster,
  /** The RPC points at devnet: the header shows a "devnet" tag. */
  isDevnet: cluster === "devnet",
  uploadUrl: process.env.NEXT_PUBLIC_UPLOAD_URL || "",
  /** Rug-proof challenge coin. Default: FLRD "Floored Demo" on devnet. */
  challengeMint: process.env.NEXT_PUBLIC_CHALLENGE_MINT || DEVNET_DEMO_MINT,
  /** The demo coin's "dev" wallet that dumps its bag in the challenge. */
  challengeDev: process.env.NEXT_PUBLIC_CHALLENGE_DEV || DEVNET_DEMO_DEV,
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, ""),
  programId: "E7ZbamLD8wenjjHitR8bUHwuNKA4Em39sqybnhk3nc87",
  githubUrl: process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/turnthecube/turnthecube",
  xUrl: process.env.NEXT_PUBLIC_X_URL || "https://x.com/turnthecube",
  docsUrl: "/how-it-works",
} as const;

/** True when an indexer is configured (live REST + websocket). */
export const hasApi = data === "indexer" && apiUrl !== "";

/** Base URL for the JSON API: the indexer, or the site itself in chain mode (relative in the browser). */
export function apiBase(): string {
  if (data === "indexer") return apiUrl;
  if (data === "chain") return isServer ? ENV.siteUrl : "";
  return "";
}

export function wsUrl(): string {
  if (!hasApi) return "";
  return apiUrl.replace(/^http/, "ws") + "/ws";
}

export function explorerTx(signature: string): string {
  const c = ENV.cluster === "mainnet-beta" ? "" : `?cluster=${ENV.cluster}`;
  return `https://explorer.solana.com/tx/${signature}${c}`;
}

export function explorerAddress(address: string): string {
  const c = ENV.cluster === "mainnet-beta" ? "" : `?cluster=${ENV.cluster}`;
  return `https://explorer.solana.com/address/${address}${c}`;
}
