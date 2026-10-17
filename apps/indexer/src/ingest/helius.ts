/**
 * Helius "raw" webhook payloads: an array of transactions in the same shape
 * as RPC `getTransaction` (meta.logMessages, transaction.signatures, slot, blockTime).
 */
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { RawTransaction } from "./handler.js";

const HeliusRawTx = z
  .object({
    slot: z.number().int().nonnegative(),
    blockTime: z.number().int().nullable().optional(),
    meta: z
      .object({
        err: z.unknown().optional(),
        logMessages: z.array(z.string()).nullable().optional(),
      })
      .passthrough()
      .nullable(),
    transaction: z
      .object({
        signatures: z.array(z.string()).min(1),
      })
      .passthrough(),
  })
  .passthrough();

export const HeliusPayload = z.union([z.array(HeliusRawTx), HeliusRawTx.transform((t) => [t])]);

export type HeliusRawTransaction = z.infer<typeof HeliusRawTx>;

export function normalizeHelius(tx: HeliusRawTransaction): RawTransaction {
  return {
    signature: tx.transaction.signatures[0]!,
    slot: tx.slot,
    blockTime: tx.blockTime ?? null,
    err: tx.meta?.err ?? null,
    logs: tx.meta?.logMessages ?? [],
  };
}

/** Constant-time comparison of the Authorization header against the configured secret. */
export function verifyWebhookAuth(header: string | undefined | null, secret: string): boolean {
  if (!secret || !header) return false;
  const candidates = [header, header.replace(/^Bearer\s+/i, "")];
  const s = Buffer.from(secret);
  return candidates.some((c) => {
    const b = Buffer.from(c);
    return b.length === s.length && timingSafeEqual(b, s);
  });
}
