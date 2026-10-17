/** Response helpers for the chain-mode route handlers. */

const PUBKEY = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SIG = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

export const isPubkey = (s: string | null | undefined): s is string => typeof s === "string" && PUBKEY.test(s);
export const isSignature = (s: string | null | undefined): s is string => typeof s === "string" && SIG.test(s);

/** JSON with CDN caching: fresh for `maxAge` seconds, served stale for `swr` more while revalidating. */
export function json(body: unknown, opts: { maxAge?: number; swr?: number; status?: number } = {}): Response {
  const maxAge = opts.maxAge ?? 0;
  const headers: Record<string, string> = { "content-type": "application/json; charset=utf-8" };
  headers["cache-control"] = maxAge > 0 ? `public, s-maxage=${maxAge}, stale-while-revalidate=${opts.swr ?? maxAge * 6}, max-age=0` : "no-store";
  return new Response(JSON.stringify(body), { status: opts.status ?? 200, headers });
}

export function bad(message: string, status = 400): Response {
  return json({ error: status === 404 ? "not_found" : "bad_request", message }, { status });
}

export function intParam(v: string | null, def: number, min: number, max: number): number {
  const n = v === null || v === "" ? def : Number(v);
  if (!Number.isInteger(n)) return def;
  return Math.min(max, Math.max(min, n));
}

/** Route handlers catch everything: the pages fall back to their empty states. */
export async function guarded(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[api]", message);
    return json({ error: "upstream", message: message.slice(0, 300) }, { status: 502 });
  }
}
