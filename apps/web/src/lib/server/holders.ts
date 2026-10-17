/** Top holders from getTokenLargestAccounts (the 20 largest), minus the program's own vaults. */
import { coinKeys } from "@floored/sdk";
import { AccountLayout } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import type { HoldersJson } from "@/lib/api/types";
import { getCoin } from "./coins";
import { memo } from "./memo";
import { serverConnection } from "./rpc";
import { tokD } from "./serialize";

export function holders(mint: string, limit = 50): Promise<HoldersJson | null> {
  return memo(
    `holders:${mint}`,
    async () => {
      const coin = await getCoin(mint);
      if (!coin) return null;
      const c = serverConnection();
      const k = coinKeys(new PublicKey(mint));
      const vaults = new Set([k.poolTokenVault.toBase58(), k.queueEscrow.toBase58(), k.curveTokenVault.toBase58()]);
      const largest = (await c.getTokenLargestAccounts(new PublicKey(mint), "confirmed")).value.filter(
        (a) => !vaults.has(a.address.toBase58()) && BigInt(a.amount) > 0n,
      );
      const infos = largest.length ? await c.getMultipleAccountsInfo(largest.map((a) => a.address)) : [];
      const supply = BigInt(coin.supply);
      const circ = BigInt(coin.circulating);
      const now = new Date().toISOString();
      const items = largest.slice(0, limit).map((a, i) => {
        const info = infos[i];
        const owner = info && info.data.length >= AccountLayout.span ? new PublicKey(AccountLayout.decode(info.data).owner).toBase58() : a.address.toBase58();
        const balance = BigInt(a.amount);
        return {
          owner,
          balance: balance.toString(),
          balance_display: tokD(balance),
          share_of_supply_bps: supply > 0n ? Number((balance * 10_000n) / supply) : null,
          share_of_circulating_bps: circ > 0n ? Number((balance * 10_000n) / circ) : null,
          last_updated: now,
        };
      });
      return { holders_count: null, refreshed: items.length > 0, items };
    },
    { fresh: 20_000, stale: 120_000 },
  );
}
