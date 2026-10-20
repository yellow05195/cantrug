import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Page header (after cardsvault.fun): the orange kicker, one title and one
 * lede in ink-2, centred, 760 px. No picture: the page content is the picture.
 */
export function PageHeader({ kicker, title, lede, children, className }: { kicker: string; title: ReactNode; lede?: ReactNode; scene?: string; children?: ReactNode; className?: string }) {
  return (
    <header className={cn("mx-auto max-w-[760px] pt-14 text-center sm:pt-20", className)}>
      <p className="kicker">{kicker}</p>
      <h1 className="mt-4 text-[clamp(32px,4.6vw,52px)] leading-[1.06]">{title}</h1>
      {lede ? <p className="mx-auto mt-4 max-w-[620px] text-[17px] leading-relaxed text-ink-2">{lede}</p> : null}
      {children}
    </header>
  );
}

/** The page frame shared by the inner pages: same measure as the home page. */
export const PAGE = "mx-auto w-full max-w-6xl px-4 sm:px-6";
