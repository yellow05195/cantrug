import { chainApi } from "@/lib/server/api";
import { bad, guarded, isPubkey, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/coins/:mint/queue */
export function GET(_req: Request, ctx: { params: Promise<{ mint: string }> }): Promise<Response> {
  return guarded(async () => {
    const { mint } = await ctx.params;
    if (!isPubkey(mint)) return bad("invalid mint");
    const q = await chainApi.queue(mint);
    if (!q) return bad("not found", 404);
    return json(q, { maxAge: 3, swr: 30 });
  });
}
