"use client";
/**
 * The connected account, whatever is behind it: a wallet-adapter wallet, or
 * (mock mode only) the demo wallet that holds a few mock coins.
 */
import { useWallet } from "@solana/wallet-adapter-react";
import type { Connection, VersionedTransaction } from "@solana/web3.js";
import { useSyncExternalStore } from "react";
import { ENV } from "@/lib/env";
import { rng } from "@/lib/mock/rng";

const KEY = "floored.demo-wallet";
const listeners = new Set<() => void>();

function readDemo(): boolean {
  if (!ENV.mock || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

let demoOn = false;
let demoInit = false;

export function setDemoConnected(on: boolean) {
  demoOn = on;
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* storage blocked */
  }
  listeners.forEach((l) => l());
}

function subscribeDemo(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

function snapshotDemo() {
  if (!demoInit) {
    demoInit = true;
    demoOn = readDemo();
  }
  return demoOn;
}

export interface Account {
  address: string | null;
  connected: boolean;
  connecting: boolean;
  isDemo: boolean;
  walletName: string;
  walletIcon: string | null;
  send: ((tx: VersionedTransaction, connection: Connection) => Promise<string>) | null;
  signAll: ((txs: VersionedTransaction[]) => Promise<VersionedTransaction[]>) | null;
  disconnect: () => void;
}

export function useAccount(): Account {
  const w = useWallet();
  const demo = useSyncExternalStore(subscribeDemo, snapshotDemo, () => false);
  if (demo && ENV.mock) {
    return {
      address: DEMO_ADDRESS,
      connected: true,
      connecting: false,
      isDemo: true,
      walletName: "Demo wallet",
      walletIcon: null,
      send: null,
      signAll: null,
      disconnect: () => setDemoConnected(false),
    };
  }
  return {
    address: w.publicKey?.toBase58() ?? null,
    connected: w.connected,
    connecting: w.connecting,
    isDemo: false,
    walletName: w.wallet?.adapter.name ?? "your wallet",
    walletIcon: w.wallet?.adapter.icon ?? null,
    send: w.publicKey ? (tx, connection) => w.sendTransaction(tx, connection, { skipPreflight: false, maxRetries: 3 }) : null,
    signAll: w.signAllTransactions ? (txs) => w.signAllTransactions!(txs) : null,
    disconnect: () => void w.disconnect(),
  };
}

/** Same derivation as DEMO_WALLET in mock/dataset.ts (kept here to avoid loading the dataset). */
export const DEMO_ADDRESS = rng(0xdec0de).pubkey().toBase58();
