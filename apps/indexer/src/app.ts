import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { UpgradeWebSocket } from "hono/ws";
import type { Logger } from "pino";
import { readRoutes } from "./api/routes.js";
import { HeliusPayload, normalizeHelius, verifyWebhookAuth } from "./ingest/helius.js";
import type { Hub, HubClient } from "./ingest/hub.js";
import type { Ingestor } from "./ingest/ingestor.js";
import type { ReadStore } from "./repo/types.js";

export interface AppDeps {
  ingestor: Ingestor;
  read: ReadStore;
  hub: Hub;
  webhookSecret: string;
  slotMs: number;
  corsOrigin?: string;
  log?: Logger;
  /** Provided by @hono/node-ws in production; omitted in tests. */
  upgradeWebSocket?: UpgradeWebSocket;
  now?: () => Date;
}

export const CACHE_CONTROL = "public, max-age=3, s-maxage=3, stale-while-revalidate=10";

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    deps.log?.error({ err, path: c.req.path }, "request failed");
    return c.json({ error: "internal_error" }, 500);
  });
  app.notFound((c) => c.json({ error: "not_found" }, 404));

  app.get("/health", async (c) => {
    c.header("Cache-Control", "no-store");
    let db = false;
    try {
      db = await deps.read.ping();
    } catch {
      db = false;
    }
    return c.json({ ok: db, db, ws_clients: deps.hub.size }, db ? 200 : 503);
  });

  app.post(
    "/webhooks/helius",
    bodyLimit({ maxSize: 25 * 1024 * 1024, onError: (c) => c.json({ error: "payload_too_large" }, 413) }),
    async (c) => {
      if (!verifyWebhookAuth(c.req.header("authorization"), deps.webhookSecret)) {
        return c.json({ error: "unauthorized" }, 401);
      }
      let body: unknown;
      try {
        body = await c.req.json();
      } catch {
        return c.json({ error: "bad_request", message: "invalid json" }, 400);
      }
      const parsed = HeliusPayload.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: "bad_request", message: "expected Helius raw transactions" }, 400);
      }
      const txs = parsed.data.map(normalizeHelius);
      // Oldest first so the projection sees events in chain order.
      txs.sort((a, b) => a.slot - b.slot);
      const results = await deps.ingestor.ingest(txs);
      const count = (s: string) => results.filter((r) => r.status === s).length;
      return c.json({
        received: txs.length,
        applied: count("applied"),
        duplicates: count("duplicate"),
        failed_txs: count("failed_tx"),
        no_events: count("no_events"),
        events: results.reduce((n, r) => n + r.events.length, 0),
      });
    },
  );

  if (deps.upgradeWebSocket) {
    const hub = deps.hub;
    app.get(
      "/ws",
      deps.upgradeWebSocket(() => {
        let client: HubClient | null = null;
        return {
          onOpen(_evt, ws) {
            client = { send: (d) => ws.send(d) };
            hub.add(client);
            ws.send(JSON.stringify({ type: "hello", subscribe: 'send {"subscribe":"<mint>"} or {"subscribe":"*"}' }));
          },
          onMessage(evt, ws) {
            if (!client) return;
            const reply = hub.onMessage(client, typeof evt.data === "string" ? evt.data : String(evt.data));
            if (reply) ws.send(reply);
          },
          onClose() {
            if (client) hub.remove(client);
          },
          onError() {
            if (client) hub.remove(client);
          },
        };
      }),
    );
  }

  const api = new Hono();
  api.use("*", cors({ origin: deps.corsOrigin ?? "*", allowMethods: ["GET", "OPTIONS"] }));
  api.use("*", async (c, next) => {
    await next();
    if (c.req.method === "GET" && c.res.status === 200) c.header("Cache-Control", CACHE_CONTROL);
  });
  api.route("/", readRoutes(deps.read, { slotMs: deps.slotMs, now: deps.now }));
  app.route("/api", api);

  return app;
}
