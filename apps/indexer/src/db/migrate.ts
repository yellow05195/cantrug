/** `pnpm db:migrate`: apply the SQL migrations in ./drizzle. */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const { db, sql } = createDb(url, { max: 1 });
try {
  await migrate(db, { migrationsFolder: join(here, "..", "..", "drizzle") });
  console.log("migrations applied");
} finally {
  await sql.end();
}
