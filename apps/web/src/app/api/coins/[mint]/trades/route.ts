import { chainApi } from "@/lib/server/api";
import { bad, guarded, intParam, isPubkey, isSignature, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/coins/:mint/trades?limit=50&before=<slot|signature> */
export function GET(req: Request, ctx: { params: Promise<{ mint: string }> }): Promise<Response> {
  return guarded(async () => {
    const { mint } = await ctx.params;
    if (!isPubkey(mint)) return bad("invalid mint");
    const u = new URL(req.url);
    const before = u.searchParams.get("before") ?? undefined;
    if (before !== undefined && !/^\d+$/.test(before) && !isSignature(before)) return bad("before: expected a slot or a signature");
    const list = await chainApi.trades(mint, intParam(u.searchParams.get("limit"), 50, 1, 200), before);
    return json(list, { maxAge: 3, swr: 30 });
  });
}
