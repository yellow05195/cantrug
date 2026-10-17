import { createHash } from "node:crypto";

/** Anchor discriminator: first 8 bytes of sha256("<namespace>:<Name>"). */
export function anchorDiscriminator(namespace: "event" | "account", name: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(`${namespace}:${name}`).digest().subarray(0, 8));
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function toHex(b: Uint8Array): string {
  return Buffer.from(b).toString("hex");
}
