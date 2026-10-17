"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** False during SSR and hydration, true after. No effect + setState round trip. */
export function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
