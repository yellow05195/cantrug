import { z } from "zod";

export const DEFAULT_PROGRAM_ID = "E7ZbamLD8wenjjHitR8bUHwuNKA4Em39sqybnhk3nc87";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "1" || v?.toLowerCase() === "true");

const Env = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  RPC_URL: z.string().url().default("https://api.devnet.solana.com"),
  HELIUS_WEBHOOK_SECRET: z.string().default(""),
  PORT: z.coerce.number().int().positive().default(8787),
  PROGRAM_ID: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/).default(DEFAULT_PROGRAM_ID),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** Estimated slot duration, for brake window ETAs. */
  SLOT_TIME_MS: z.coerce.number().positive().default(400),
  SNAPSHOT_INTERVAL_MS: z.coerce.number().int().nonnegative().default(60_000),
  /** 0 disables the holders refresher (default: RPC-heavy, see README). */
  HOLDERS_REFRESH_INTERVAL_MS: z.coerce.number().int().nonnegative().default(0),
  HOLDERS_REFRESH_MAX_COINS: z.coerce.number().int().positive().default(25),
  /** Fetch the off-chain metadata JSON at `uri` for image/description (outbound HTTP to creator-chosen hosts). */
  FETCH_METADATA: bool,
  CORS_ORIGIN: z.string().default("*"),
  STATS_DEBOUNCE_MS: z.coerce.number().int().nonnegative().default(2_000),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = Env.safeParse(env);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`invalid environment: ${msg}`);
  }
  return r.data;
}
