import { chainApi } from "@/lib/server/api";
import { guarded, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/stats */
export function GET(): Promise<Response> {
  return guarded(async () => json(await chainApi.stats(), { maxAge: 30, swr: 300 }));
}
