"use client";
import { useEffect, useRef, useState } from "react";
import { subscribe } from "@/lib/api/ws";
import { ENV } from "@/lib/env";
import { readCoin, readUser, type CoinChain, type UserChain } from "./reads";

export interface ChainView {
  coin: CoinChain | null;
  user: UserChain | null;
  loading: boolean;
  error: string | null;
  /** The coin account does not exist on this cluster. */
  missing: boolean;
  refresh: () => void;
}

/**
 * On-chain `CoinState` + mint supply (+ the wallet's ATA, SOL balance and
 * queue entry). Re-read on every websocket event for the mint and every 12 s.
 */
export function useCoinChain(mint: string, owner: string | null): ChainView {
  const [coin, setCoin] = useState<CoinChain | null>(null);
  const [user, setUser] = useState<UserChain | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const loadRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let alive = true;
    let inflight = false;
    let again = false;
    const load = async () => {
      if (inflight) {
        again = true;
        return;
      }
      inflight = true;
      try {
        if (ENV.mock) {
          const m = await import("./mockChain");
          const c = m.mockReadCoin(mint);
          if (!alive) return;
          setCoin(c);
          setMissing(!c);
          setUser(c && owner ? m.mockReadUser(mint, owner) : null);
        } else {
          const c = await readCoin(mint);
          const u = c && owner ? await readUser(mint, owner, c.state) : null;
          if (!alive) return;
          setCoin(c);
          setMissing(!c);
          setUser(u);
        }
        setError(null);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        inflight = false;
        if (alive) setLoading(false);
        if (again && alive) {
          again = false;
          void load();
        }
      }
    };
    loadRef.current = () => void load();
    const first = setTimeout(() => void load(), 0);
    const id = setInterval(() => void load(), ENV.mock ? 5000 : 12_000);
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribe(mint, () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => void load(), ENV.mock ? 50 : 700);
    });
    return () => {
      alive = false;
      clearTimeout(first);
      clearInterval(id);
      if (t) clearTimeout(t);
      unsub();
    };
  }, [mint, owner]);

  return { coin, user, loading, error, missing, refresh: () => loadRef.current() };
}
