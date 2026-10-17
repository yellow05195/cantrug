import type { Phase, SortKey } from "@/lib/api/types";
import { chainApi } from "@/lib/server/api";
import { guarded, intParam, json } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SORTS = new Set<SortKey>(["new", "graduating", "floor", "volume"]);
const PHASES = new Set<Phase>(["curve", "graduated"]);

/** GET /api/coins?sort=new|graduating|floor|volume&phase=curve|graduated&limit=50&cursor=<offset> */
export function GET(req: Request): Promise<Response> {
  return guarded(async () => {
    const u = new URL(req.url);
    const sort = u.searchParams.get("sort") as SortKey | null;
    const phase = u.searchParams.get("phase") as Phase | null;
    const list = await chainApi.coins({
      sort: sort && SORTS.has(sort) ? sort : "new",
      phase: phase && PHASES.has(phase) ? phase : undefined,
      limit: intParam(u.searchParams.get("limit"), 50, 1, 100),
      cursor: u.searchParams.get("cursor") ?? undefined,
    });
    return json(list, { maxAge: 5, swr: 60 });
  });
}
