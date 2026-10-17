/**
 * The live stream without a websocket: the program's newest transactions as
 * indexer-style frames. The browser polls `/api/events?after=<signature>` and
 * dispatches whatever is newer than the signature it last saw.
 */
import { PROGRAM_ID } from "@floored/sdk";
import type { WsMessage } from "@/lib/api/types";
import { parseFlooredEvents } from "@/lib/chain/events";
import { signaturesOf } from "./history";
import { memo } from "./memo";
import { mapLimit, serverConnection } from "./rpc";
import { eventFrame } from "./serialize";

export interface EventsPage {
  /** Oldest first. */
  items: WsMessage[];
  /** The newest signature the program has (pass it back as `after`). */
  latest: string | null;
}

const LIMIT = 60;

export function programEvents(after: string | null): Promise<EventsPage> {
  return memo(
    `events:${after ?? ""}`,
    async () => {
      const c = serverConnection();
      const sigs = await signaturesOf(PROGRAM_ID, after, LIMIT);
      const latest = sigs[0]?.signature ?? after;
      // No cursor yet: the client only needs the latest signature, not a replay.
      if (!after || !sigs.length) return { items: [], latest };
      const ok = sigs.filter((s) => !s.err).reverse();
      const chunks: (typeof ok)[] = [];
      for (let i = 0; i < ok.length; i += 50) chunks.push(ok.slice(i, i + 50));
      const groups = await mapLimit(chunks, 2, (chunk) =>
        c.getTransactions(
          chunk.map((s) => s.signature),
          { commitment: "confirmed", maxSupportedTransactionVersion: 0 },
        ),
      );
      const items: WsMessage[] = [];
      groups.flat().forEach((tx, i) => {
        const s = ok[i]!;
        if (!tx || tx.meta?.err) return;
        const ts = new Date((tx.blockTime ?? s.blockTime ?? 0) * 1000);
        for (const ev of parseFlooredEvents(tx.meta?.logMessages)) items.push(eventFrame(ev, s.signature, tx.slot, ts));
      });
      return { items, latest };
    },
    { fresh: 3000, stale: 10_000 },
  );
}
