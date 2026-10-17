/** A wallet's FLOORED positions as the indexer's /api/portfolio shape, from token accounts + CoinState. */
import { coinFloorQ64, coinPriceQ64, valueAtQ64 } from "@floored/sdk";
import type { PortfolioItemJson, PortfolioJson } from "@/lib/api/types";
import { readPositions } from "@/lib/chain/portfolio";
import { getCoin } from "./coins";
import { memo } from "./memo";
import { mapLimit } from "./rpc";
import { solD, tokD } from "./serialize";

export function portfolio(owner: string): Promise<PortfolioJson> {
  return memo(
    `portfolio:${owner}`,
    async () => {
      const positions = await readPositions(owner);
      const coins = await mapLimit(positions, 6, (p) => getCoin(p.mint).catch(() => null));
      let totalPrice = 0n;
      let totalFloor = 0n;
      const items: PortfolioItemJson[] = positions.flatMap((p, i) => {
        const c = coins[i];
        if (!c) return [];
        const graduated = p.state.phase === 1;
        const atPrice = valueAtQ64(coinPriceQ64(p.state), p.balance);
        const atFloor = graduated ? valueAtQ64(coinFloorQ64(p.state, p.supply), p.balance) : 0n;
        totalPrice += atPrice;
        totalFloor += atFloor;
        return [
          {
            mint: p.mint,
            name: c.name,
            symbol: c.symbol,
            image_url: c.image_url,
            phase: c.phase,
            balance: p.balance.toString(),
            balance_display: tokD(p.balance),
            balance_source: "chain" as const,
            price: c.price,
            floor: c.floor,
            floor_preview: c.floor_preview,
            floor_active: c.floor_active,
            value_at_price: atPrice.toString(),
            value_at_price_display: solD(atPrice),
            value_at_floor: atFloor.toString(),
            value_at_floor_display: solD(atFloor),
            trades: 0,
            sol_spent: "0",
            sol_received: "0",
            sol_redeemed: "0",
            last_trade_at: null,
          },
        ];
      });
      return {
        owner,
        items,
        total_value_at_price: totalPrice.toString(),
        total_value_at_price_display: solD(totalPrice),
        total_value_at_floor: totalFloor.toString(),
        total_value_at_floor_display: solD(totalFloor),
        note: "Balances are read from the wallet's token accounts; trade totals need the indexer.",
      };
    },
    { fresh: 4000, stale: 30_000 },
  );
}
