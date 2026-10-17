import { chainApi } from "@/lib/server/api";
import { bad, guarded, isPubkey, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/portfolio/:owner */
export function GET(_req: Request, ctx: { params: Promise<{ owner: string }> }): Promise<Response> {
  return guarded(async () => {
    const { owner } = await ctx.params;
    if (!isPubkey(owner)) return bad("invalid owner");
    return json(await chainApi.portfolio(owner), { maxAge: 4, swr: 30 });
  });
}
