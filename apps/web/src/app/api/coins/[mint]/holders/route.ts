import { chainApi } from "@/lib/server/api";
import { bad, guarded, intParam, isPubkey, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/coins/:mint/holders?limit=50 */
export function GET(req: Request, ctx: { params: Promise<{ mint: string }> }): Promise<Response> {
  return guarded(async () => {
    const { mint } = await ctx.params;
    if (!isPubkey(mint)) return bad("invalid mint");
    const h = await chainApi.holders(mint, intParam(new URL(req.url).searchParams.get("limit"), 50, 1, 500));
    if (!h) return bad("not found", 404);
    return json(h, { maxAge: 20, swr: 120 });
  });
}
