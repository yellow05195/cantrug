import type { ReactNode } from "react";

/**
 * Route transition (DESIGN.md v2 motion 1): a template remounts on every
 * navigation, so the page content fades and rises 8 px over 220 ms via
 * `@starting-style` (see `.route-in`). Coin avatars and names also carry a
 * view-transition name, so card to coin page morphs where the API exists.
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="route-in">{children}</div>;
}
