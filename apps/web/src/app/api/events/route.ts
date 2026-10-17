import { chainApi } from "@/lib/server/api";
import { bad, guarded, isSignature, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/events?after=<signature>: program events newer than `after`, oldest first, plus the newest signature. */
export function GET(req: Request): Promise<Response> {
  return guarded(async () => {
    const after = new URL(req.url).searchParams.get("after");
    if (after && !isSignature(after)) return bad("after: expected a signature");
    return json(await chainApi.events(after || null), { maxAge: 3, swr: 10 });
  });
}
