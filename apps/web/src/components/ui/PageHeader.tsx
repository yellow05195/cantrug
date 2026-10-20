import type { ReactNode } from "react";
import { Cube } from "@/components/home/Cube";
import { cn } from "@/lib/cn";
import { cubeWithFront, FACE_BG, faceText, type Face } from "@/lib/faces";

/**
 * Page header: every page is a face of the cube. A band the width of the
 * screen in the page's colour, the words on the left, a small cube showing
 * that face on the right. Without `face`, the old centred header.
 */
export function PageHeader({ kicker, title, lede, children, className, face }: { kicker: string; title: ReactNode; lede?: ReactNode; scene?: string; children?: ReactNode; className?: string; face?: Face }) {
  if (!face) {
    return (
      <header className={cn("mx-auto max-w-[760px] pt-14 text-center sm:pt-20", className)}>
        <p className="kicker">{kicker}</p>
        <h1 className="mt-4 text-[clamp(32px,4.6vw,52px)] leading-[1.06]">{title}</h1>
        {lede ? <p className="mx-auto mt-4 max-w-[620px] text-[17px] leading-relaxed text-ink-2">{lede}</p> : null}
        {children}
      </header>
    );
  }
  const onDark = faceText(face) === "text-white";
  return (
    <header className={cn("relative left-1/2 w-screen -translate-x-1/2 overflow-hidden", FACE_BG[face], faceText(face), className)}>
      <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 py-12 sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:py-16">
        <div>
          <p className={cn("text-sm font-semibold", onDark ? "text-white/75" : "text-ink/60")}>{kicker}</p>
          <h1 className="mt-3 max-w-[18ch] text-[clamp(36px,5vw,64px)]">{title}</h1>
          {lede ? <p className={cn("mt-4 max-w-[56ch] text-[17px] font-medium leading-relaxed", onDark ? "text-white/85" : "text-ink/75")}>{lede}</p> : null}
          {children}
        </div>
        <div className="relative hidden h-[180px] w-[220px] md:block" aria-hidden>
          <div className="absolute bottom-3 left-1/2 h-6 w-[60%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgba(17,18,22,0.35),transparent)] blur-md" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Cube size={46} colors={cubeWithFront(face)} />
          </div>
        </div>
      </div>
    </header>
  );
}

/** The page frame shared by the inner pages: same measure as the home page. */
export const PAGE = "mx-auto w-full max-w-6xl px-4 sm:px-6";
