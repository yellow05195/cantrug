import { chainApi } from "@/lib/server/api";
import { bad, guarded, isPubkey, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/coins/:mint */
export function GET(_req: Request, ctx: { params: Promise<{ mint: string }> }): Promise<Response> {
  return guarded(async () => {
    const { mint } = await ctx.params;
    if (!isPubkey(mint)) return bad("invalid mint");
    const coin = await chainApi.coin(mint);
    if (!coin) return bad("not found", 404);
    return json(coin, { maxAge: 2, swr: 30 });
  });
}
