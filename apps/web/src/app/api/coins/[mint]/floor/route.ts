import { chainApi } from "@/lib/server/api";
import { bad, guarded, isPubkey, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function time(v: string | null): Date | undefined {
  if (!v) return undefined;
  const n = Number(v);
  const d = Number.isFinite(n) && v.trim() !== "" ? new Date(n < 1e12 ? n * 1000 : n) : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** GET /api/coins/:mint/floor?interval=1m|5m|15m|1h|4h|1d&from=&to= */
export function GET(req: Request, ctx: { params: Promise<{ mint: string }> }): Promise<Response> {
  return guarded(async () => {
    const { mint } = await ctx.params;
    if (!isPubkey(mint)) return bad("invalid mint");
    const u = new URL(req.url);
    const out = await chainApi.floor(mint, { interval: u.searchParams.get("interval") ?? undefined, from: time(u.searchParams.get("from")), to: time(u.searchParams.get("to")) });
    return json(out, { maxAge: 10, swr: 60 });
  });
}
