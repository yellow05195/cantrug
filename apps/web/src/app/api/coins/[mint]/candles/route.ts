import type { CandleInterval } from "@/lib/api/types";
import { chainApi } from "@/lib/server/api";
import { bad, guarded, isPubkey, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INTERVALS = new Set<CandleInterval>(["1m", "5m", "1h"]);

/** GET /api/coins/:mint/candles?interval=1m|5m|1h */
export function GET(req: Request, ctx: { params: Promise<{ mint: string }> }): Promise<Response> {
  return guarded(async () => {
    const { mint } = await ctx.params;
    if (!isPubkey(mint)) return bad("invalid mint");
    const raw = new URL(req.url).searchParams.get("interval") as CandleInterval | null;
    const interval = raw && INTERVALS.has(raw) ? raw : "1m";
    return json(await chainApi.candles(mint, interval), { maxAge: 5, swr: 60 });
  });
}
