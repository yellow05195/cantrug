import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Scene } from "./Scene";

/**
 * Page header (atelier): an optional drawn Scene banner, the mono kicker, one
 * Fredoka title and one lede in ink-2. Centred on the page axis, 760 px.
 */
export function PageHeader({ kicker, title, lede, scene, children, className }: { kicker: string; title: ReactNode; lede?: ReactNode; scene?: string; children?: ReactNode; className?: string }) {
  return (
    <header className={cn("mx-auto max-w-[760px] pt-12 text-center sm:pt-16", className)}>
      {scene ? (
        <div className="mb-10 overflow-hidden rounded-3xl border border-seam bg-bg-2">
          <Scene seed={scene} w={200} h={52} className="h-40" />
        </div>
      ) : null}
      <p className="kicker">{kicker}</p>
      <h1 className="mt-4 text-[clamp(32px,5vw,52px)] leading-[1.05]">{title}</h1>
      {lede ? <p className="mx-auto mt-4 max-w-[640px] text-lg text-ink-2">{lede}</p> : null}
      {children}
    </header>
  );
}

/** The page frame shared by the inner pages: same measure as the home page. */
export const PAGE = "mx-auto w-full max-w-[1120px] px-4 sm:px-6";
