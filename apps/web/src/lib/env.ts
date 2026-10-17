/** Public runtime configuration. Every value is inlined at build time by Next. */

const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
const mockFlag = process.env.NEXT_PUBLIC_MOCK;
const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";

type Cluster = "devnet" | "mainnet-beta" | "testnet";
function inferCluster(): Cluster {
  const explicit = process.env.NEXT_PUBLIC_CLUSTER as Cluster | undefined;
  if (explicit === "devnet" || explicit === "mainnet-beta" || explicit === "testnet") return explicit;
  if (/devnet/i.test(rpcUrl)) return "devnet";
  if (/testnet/i.test(rpcUrl)) return "testnet";
  if (/mainnet/i.test(rpcUrl)) return "mainnet-beta";
  return "devnet";
}
const cluster = inferCluster();

export const DEVNET_DEMO_MINT = "7PwqFN6yrgWQDim5RFR4au4znTbr2NBGH6ND1JQgFVYY";
export const DEVNET_DEMO_DEV = "5rA2GzrTpitKbeeuK9EPzvZR1TaCGZ5feZ2PhJmJ7evE";

export const ENV = {
  /** Indexer origin, e.g. https://api.floored.fun (REST under /api, websocket at /ws). */
  apiUrl,
  /** Mock mode: in-memory dataset + mock websocket + mock chain. Default on when no API URL is set. */
  mock: mockFlag === "1" || mockFlag === "true" || (mockFlag !== "0" && mockFlag !== "false" && apiUrl === ""),
  rpcUrl,
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
  githubUrl: "https://github.com/floored-fun/floored",
  xUrl: "https://x.com/flooredfun",
  docsUrl: "/how-it-works",
} as const;

/** True when an indexer is configured (live REST + websocket). */
export const hasApi = !ENV.mock && ENV.apiUrl !== "";

export function wsUrl(): string {
  if (!ENV.apiUrl) return "";
  return ENV.apiUrl.replace(/^http/, "ws") + "/ws";
}

export function explorerTx(signature: string): string {
  const c = ENV.cluster === "mainnet-beta" ? "" : `?cluster=${ENV.cluster}`;
  return `https://explorer.solana.com/tx/${signature}${c}`;
}

export function explorerAddress(address: string): string {
  const c = ENV.cluster === "mainnet-beta" ? "" : `?cluster=${ENV.cluster}`;
  return `https://explorer.solana.com/address/${address}${c}`;
}
