"use client";
import {
  SolanaMobileWalletAdapter,
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
} from "@solana-mobile/wallet-adapter-mobile";
import type { Adapter } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { useMemo, type ReactNode } from "react";
import { Toaster } from "@/components/ui/Toaster";
import { ENV } from "@/lib/env";
import { TxProvider } from "@/lib/tx/TxProvider";

/**
 * Wallets: Phantom and Solflare adapters; Backpack and every other Wallet
 * Standard wallet are detected automatically; Seeker / Saga and any Android
 * device get the Mobile Wallet Adapter.
 */
export function AppProviders({ children, closeLabel }: { children: ReactNode; closeLabel: string }) {
  const wallets = useMemo<Adapter[]>(() => {
    const list: Adapter[] = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];
    if (typeof navigator !== "undefined" && /android/i.test(navigator.userAgent)) {
      list.unshift(
        new SolanaMobileWalletAdapter({
          addressSelector: createDefaultAddressSelector(),
          appIdentity: { name: "Cubie", uri: typeof window !== "undefined" ? window.location.origin : ENV.siteUrl, icon: "/floored-mark.svg" },
          authorizationResultCache: createDefaultAuthorizationResultCache(),
          chain: ENV.cluster === "mainnet-beta" ? "solana:mainnet" : `solana:${ENV.cluster}`,
          onWalletNotFound: createDefaultWalletNotFoundHandler(),
        }),
      );
    }
    return list;
  }, []);

  return (
    <ConnectionProvider endpoint={ENV.rpcUrl} config={{ commitment: "confirmed" }}>
      <WalletProvider wallets={wallets} autoConnect>
        <TxProvider>
          {children}
          <Toaster closeLabel={closeLabel} />
        </TxProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
