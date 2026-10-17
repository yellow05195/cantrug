import { PublicKey } from "@solana/web3.js";

/** mulberry32: small, fast, deterministic. Same seed, same dataset on server and client. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo: number, hi: number) => lo + (hi - lo) * next(),
    int: (lo: number, hi: number) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]!,
    chance: (p: number) => next() < p,
    /** Log-normal-ish amount between lo and hi, skewed to small values. */
    skew: (lo: number, hi: number, k = 2.2) => lo + (hi - lo) * Math.pow(next(), k),
    pubkey: () => {
      const b = new Uint8Array(32);
      for (let i = 0; i < 32; i++) b[i] = Math.floor(next() * 256);
      return new PublicKey(b);
    },
    signature: () => {
      const b1 = new Uint8Array(32);
      const b2 = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        b1[i] = Math.floor(next() * 256);
        b2[i] = Math.floor(next() * 256);
      }
      return new PublicKey(b1).toBase58() + new PublicKey(b2).toBase58();
    },
  };
}

export type Rng = ReturnType<typeof rng>;

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
