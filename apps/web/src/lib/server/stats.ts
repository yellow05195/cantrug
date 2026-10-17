/**
 * Global stats without an indexer: the totals live in GlobalConfig; the
 * per-day series and "rugs avoided" are rebuilt from the histories of the
 * coins that redeemed or braked (capped, memoized a minute).
 */
import type { StatsJson } from "@/lib/api/types";
import { coinRows, globalConfig } from "./coins";
import { derive } from "./history";
import { memo } from "./memo";
import { mapLimit } from "./rpc";
import { solD } from "./serialize";

const DAYS = 90;
const MAX_COINS = 30;

export function stats(): Promise<StatsJson> {
  return memo(
    "stats",
    async () => {
      const [cfg, rows] = await Promise.all([globalConfig(), coinRows()]);
      const brakeEngagements = rows.reduce((n, r) => n + r.brake.engagements, 0);
      const redeemers = rows
        .filter((r) => r.redeem_count > 0)
        .sort((a, b) => Number(b.total_redeemed_sol) - Number(a.total_redeemed_sol))
        .slice(0, MAX_COINS);
      const braked = rows.filter((r) => r.brake.engagements > 0).slice(0, MAX_COINS);
      const wanted = [...new Set([...redeemers, ...braked].map((r) => r.mint))];
      const histories = await mapLimit(wanted, 4, (m) => derive(m).catch(() => null));
      const byMint = new Map(wanted.map((m, i) => [m, histories[i]]));
      const since = Date.now() - DAYS * 86_400_000;
      const byDay = new Map<string, { sol: bigint; count: number }>();
      const biggest: NonNullable<StatsJson["biggest_redeems"]> = [];
      let rugsAvoided = 0;
      for (const r of rows) {
        const h = byMint.get(r.mint);
        if (!h) continue;
        for (const t of h.rows) {
          if (t.kind !== "redeem") continue;
          const ms = Date.parse(t.ts);
          if (ms >= since) {
            const day = t.ts.slice(0, 10);
            const d = byDay.get(day) ?? { sol: 0n, count: 0 };
            d.sol += BigInt(t.sol_amount);
            d.count++;
            byDay.set(day, d);
          }
          biggest.push({ mint: r.mint, symbol: r.symbol, user: t.user, sol_out: t.sol_amount, ts: t.ts });
        }
        // A rug avoided: a brake episode where 10 % or more of the supply ended up queued.
        const supply = BigInt(r.supply || "0");
        const maxByEpoch = new Map<number, bigint>();
        for (const q of h.queue) {
          if (q.epoch === null || q.queued_total === null) continue;
          const v = BigInt(q.queued_total);
          if (v > (maxByEpoch.get(q.epoch) ?? 0n)) maxByEpoch.set(q.epoch, v);
        }
        for (const v of maxByEpoch.values()) if (supply > 0n && v * 10n >= supply) rugsAvoided++;
      }
      biggest.sort((a, b) => (BigInt(b.sol_out) > BigInt(a.sol_out) ? 1 : BigInt(b.sol_out) < BigInt(a.sol_out) ? -1 : 0));
      const total = cfg?.totalRedeemedSol ?? rows.reduce((n, r) => n + BigInt(r.total_redeemed_sol || "0"), 0n);
      return {
        sol_redeemed_total: total.toString(),
        sol_redeemed_total_display: solD(total),
        coins_created: Number(cfg?.coinsCreated ?? BigInt(rows.length)),
        coins_graduated: Number(cfg?.coinsGraduated ?? BigInt(rows.filter((r) => r.phase === "graduated").length)),
        brake_engagements_total: brakeEngagements,
        rugs_avoided: rugsAvoided,
        updated_at: new Date().toISOString(),
        sol_redeemed_by_day: [...byDay.entries()]
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([day, d]) => ({ day, sol_out: d.sol.toString(), sol_out_display: solD(d.sol), count: d.count })),
        biggest_redeems: biggest.slice(0, 10),
      };
    },
    { fresh: 30_000, stale: 300_000 },
  );
}
