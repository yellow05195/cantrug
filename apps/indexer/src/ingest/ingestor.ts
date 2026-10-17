import type { Logger } from "pino";
import type { IngestStore } from "../repo/types.js";
import { processTransaction, type AppliedEvent, type ProcessResult, type RawTransaction } from "./handler.js";

export type AppliedListener = (events: AppliedEvent[]) => void;

/**
 * Sequential ingestion front: transactions are applied one by one (one DB
 * transaction each), then listeners (websocket hub, stats debouncer,
 * metadata fetcher) are notified after commit.
 */
export class Ingestor {
  private listeners: AppliedListener[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly store: IngestStore,
    private readonly programId: string,
    private readonly log?: Logger,
  ) {}

  onApplied(fn: AppliedListener): void {
    this.listeners.push(fn);
  }

  /** Apply transactions in order. Throws on the first storage error (callers retry; work is idempotent). */
  ingest(txs: readonly RawTransaction[]): Promise<ProcessResult[]> {
    const run = async () => {
      const results: ProcessResult[] = [];
      for (const tx of txs) {
        const r = await processTransaction(this.store, tx, this.programId);
        if (r.truncated) this.log?.warn({ signature: r.signature }, "log truncated: events may be missing for this transaction");
        // Once per signature: events in the pre-upgrade layout had absent fields filled in.
        if (r.legacyFields.length) this.log?.debug({ signature: r.signature, fields: r.legacyFields }, "pre-upgrade event layout: absent fields defaulted");
        results.push(r);
        if (r.events.length) {
          for (const l of this.listeners) {
            try {
              l(r.events);
            } catch (err) {
              this.log?.error({ err }, "applied-event listener failed");
            }
          }
        }
      }
      return results;
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }
}
