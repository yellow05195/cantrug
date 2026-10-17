/**
 * Backfill / recovery CLI: walks getSignaturesForAddress(PROGRAM_ID) back in
 * time, then replays the transactions oldest-first through the same handler
 * as the webhook. Idempotent: already-processed signatures are skipped.
 *
 *   pnpm backfill                       # whole history
 *   pnpm backfill --limit 5000          # newest 5000 signatures only
 *   pnpm backfill --until <signature>   # stop when reaching a known signature
 *   pnpm backfill --before <signature>  # start below a signature
 *   pnpm backfill --batch 20 --delay-ms 250
 */
import { parseArgs } from "node:util";
import { Connection, PublicKey, type ParsedTransactionWithMeta } from "@solana/web3.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import type { RawTransaction } from "./ingest/handler.js";
import { Ingestor } from "./ingest/ingestor.js";
import { createLogger } from "./logger.js";
import { DrizzleStore } from "./repo/drizzle.js";

export function normalizeParsed(signature: string, tx: ParsedTransactionWithMeta): RawTransaction {
  return {
    signature,
    slot: tx.slot,
    blockTime: tx.blockTime ?? null,
    err: tx.meta?.err ?? null,
    logs: tx.meta?.logMessages ?? [],
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, what: string, log: ReturnType<typeof createLogger>, tries = 6): Promise<T> {
  let delay = 500;
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= tries) throw err;
      log.warn({ err: String(err), attempt: i }, `${what} failed, retrying in ${delay} ms`);
      await sleep(delay);
      delay = Math.min(delay * 2, 15_000);
    }
  }
}

async function main() {
  const { values } = parseArgs({
    // `pnpm backfill -- --limit 10` forwards a literal "--": drop it.
    args: process.argv.slice(2).filter((a) => a !== "--"),
    options: {
      limit: { type: "string" },
      until: { type: "string" },
      before: { type: "string" },
      batch: { type: "string", default: "20" },
      "delay-ms": { type: "string", default: "200" },
    },
  });
  const cfg = loadConfig();
  const log = createLogger(cfg.LOG_LEVEL);
  const conn = new Connection(cfg.RPC_URL, "confirmed");
  const program = new PublicKey(cfg.PROGRAM_ID);
  const { db, sql } = createDb(cfg.DATABASE_URL, { max: 4 });
  const store = new DrizzleStore(db);
  const ingestor = new Ingestor(store, cfg.PROGRAM_ID, log);
  const max = values.limit ? Number(values.limit) : Number.POSITIVE_INFINITY;
  const batch = Math.max(1, Math.min(100, Number(values.batch)));
  const delayMs = Math.max(0, Number(values["delay-ms"]));

  try {
    // 1. Collect signatures newest → oldest.
    const sigs: { signature: string; slot: number; failed: boolean }[] = [];
    let before = values.before;
    while (sigs.length < max) {
      const page = await withRetry(
        () => conn.getSignaturesForAddress(program, { before, until: values.until, limit: Math.min(1000, max - sigs.length) }, "confirmed"),
        "getSignaturesForAddress",
        log,
      );
      if (page.length === 0) break;
      for (const s of page) sigs.push({ signature: s.signature, slot: s.slot, failed: s.err !== null });
      before = page[page.length - 1]!.signature;
      log.info({ collected: sigs.length, oldestSlot: page[page.length - 1]!.slot }, "signatures");
      if (page.length < 1000) break;
      await sleep(delayMs);
    }

    // 2. Replay oldest → newest.
    sigs.reverse();
    const todo = sigs.filter((s) => !s.failed);
    let applied = 0;
    let events = 0;
    for (let i = 0; i < todo.length; i += batch) {
      const chunk = todo.slice(i, i + batch);
      const txs = await withRetry(
        () => conn.getParsedTransactions(chunk.map((c) => c.signature), { maxSupportedTransactionVersion: 0, commitment: "confirmed" }),
        "getParsedTransactions",
        log,
      );
      const raws: RawTransaction[] = [];
      txs.forEach((tx, j) => {
        if (tx) raws.push(normalizeParsed(chunk[j]!.signature, tx));
        else log.warn({ signature: chunk[j]!.signature }, "transaction not found (pruned by the RPC?)");
      });
      const results = await ingestor.ingest(raws);
      applied += results.filter((r) => r.status === "applied").length;
      events += results.reduce((n, r) => n + r.events.length, 0);
      log.info({ progress: `${Math.min(i + batch, todo.length)}/${todo.length}`, applied, events }, "backfill");
      await sleep(delayMs);
    }

    await store.recomputeGlobalStats();
    log.info({ signatures: sigs.length, applied, events }, "backfill done");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
