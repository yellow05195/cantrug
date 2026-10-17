import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Page header (flat house style): mono kicker, one title at weight 600, one lede in ink-2. Left aligned, 720 px. */
export function PageHeader({ kicker, title, lede, children, className }: { kicker: string; title: ReactNode; lede?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <header className={cn("max-w-[720px] pt-14 sm:pt-20", className)}>
      <p className="kicker">{kicker}</p>
      <h1 className="mt-4 text-[clamp(30px,4.4vw,48px)] font-semibold leading-[1.08] tracking-[-0.02em]">{title}</h1>
      {lede ? <p className="mt-5 text-lg text-ink-2">{lede}</p> : null}
      {children}
    </header>
  );
}

/** The page frame shared by the inner pages: same measure as the home page. */
export const PAGE = "mx-auto w-full max-w-[1120px] px-4 sm:px-6";
