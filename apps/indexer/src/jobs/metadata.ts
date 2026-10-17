/**
 * Off-chain metadata (image, description) from the coin's `uri` JSON.
 * The URI is chosen by the coin creator, so the fetch is defensive: https
 * (or ipfs:// through a public gateway) only, no IP-literal / localhost /
 * private hostnames, no redirects, 5 s timeout, 256 KiB cap. DNS rebinding
 * is not prevented; run with FETCH_METADATA=0 (default) if that matters.
 */
import { isIP } from "node:net";

const MAX_BYTES = 256 * 1024;
const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

export function resolveMetadataUrl(uri: string): URL | null {
  let s = uri.trim();
  if (s.startsWith("ipfs://")) s = IPFS_GATEWAY + s.slice("ipfs://".length).replace(/^ipfs\//, "");
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host) !== 0) return null;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) return null;
  if (u.port && u.port !== "443") return null;
  return u;
}

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export async function fetchCoinMetadata(uri: string, timeoutMs = 5_000): Promise<{ image_url: string | null; description: string | null } | null> {
  const url = resolveMetadataUrl(uri);
  if (!url) return null;
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(timeoutMs), headers: { accept: "application/json" } });
  if (!res.ok || !res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const json = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  const image = cleanText(json.image, 512);
  const imageUrl = image ? (resolveMetadataUrl(image)?.toString() ?? null) : null;
  return { image_url: imageUrl, description: cleanText(json.description, 2_000) };
}
