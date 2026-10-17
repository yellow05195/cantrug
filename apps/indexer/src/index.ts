/** Server entry: HTTP API, Helius webhook, websocket fan-out, background jobs. */
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { Hub } from "./ingest/hub.js";
import { Ingestor } from "./ingest/ingestor.js";
import { debounce } from "./jobs/debounce.js";
import { startHoldersJob } from "./jobs/holders.js";
import { fetchCoinMetadata } from "./jobs/metadata.js";
import { startSnapshotJob } from "./jobs/snapshots.js";
import { createLogger } from "./logger.js";
import { DrizzleStore } from "./repo/drizzle.js";

const cfg = loadConfig();
const log = createLogger(cfg.LOG_LEVEL);
if (!cfg.HELIUS_WEBHOOK_SECRET) log.warn("HELIUS_WEBHOOK_SECRET is empty: every webhook call will be rejected");

const { db, sql } = createDb(cfg.DATABASE_URL);
const store = new DrizzleStore(db);
const hub = new Hub();
const ingestor = new Ingestor(store, cfg.PROGRAM_ID, log);

const stats = debounce(() => store.recomputeGlobalStats(), cfg.STATS_DEBOUNCE_MS, cfg.STATS_DEBOUNCE_MS * 5, (err) =>
  log.error({ err }, "global stats recompute failed"),
);

ingestor.onApplied((events) => hub.broadcast(events));
ingestor.onApplied(() => stats.trigger());
if (cfg.FETCH_METADATA) {
  ingestor.onApplied((events) => {
    for (const e of events) {
      if (e.type !== "CoinCreated") continue;
      const uri = (e.data as { uri: string }).uri;
      fetchCoinMetadata(uri)
        .then((m) => (m ? store.setCoinMetadata(e.mint, m) : undefined))
        .catch((err) => log.debug({ err, mint: e.mint }, "metadata fetch failed"));
    }
  });
}

// node-ws needs the root app before routes are mounted.
const root = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app: root });
const app = createApp({
  ingestor,
  read: store,
  hub,
  webhookSecret: cfg.HELIUS_WEBHOOK_SECRET,
  slotMs: cfg.SLOT_TIME_MS,
  corsOrigin: cfg.CORS_ORIGIN,
  log,
  upgradeWebSocket,
});
root.route("/", app);

const server = serve({ fetch: root.fetch, port: cfg.PORT }, (info) => log.info({ port: info.port, programId: cfg.PROGRAM_ID }, "indexer listening"));
injectWebSocket(server);

const stops: (() => void)[] = [];
if (cfg.SNAPSHOT_INTERVAL_MS > 0) stops.push(startSnapshotJob(store, cfg.SNAPSHOT_INTERVAL_MS, log));
if (cfg.HOLDERS_REFRESH_INTERVAL_MS > 0) {
  stops.push(startHoldersJob({ store, rpcUrl: cfg.RPC_URL, intervalMs: cfg.HOLDERS_REFRESH_INTERVAL_MS, maxCoins: cfg.HOLDERS_REFRESH_MAX_COINS, log }));
}
stats.trigger();

const shutdown = async (signal: string) => {
  log.info({ signal }, "shutting down");
  for (const s of stops) s();
  await stats.flush().catch(() => undefined);
  server.close();
  await sql.end({ timeout: 5 });
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
