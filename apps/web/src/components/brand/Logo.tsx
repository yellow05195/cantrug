import { cn } from "@/lib/cn";

/*
 * The mark: one face of the cube, nine stickers on black, the bottom row
 * orange like the floor every coin stands on.
 */
const FACE = ["#ffffff", "#12b05a", "#1f5fd6", "#ffd23f", "#ffffff", "#e5322b", "#ff6a13", "#ff6a13", "#ff6a13"];

export function LogoMark({ size = 24, className, title }: { size?: number; className?: string; title?: string; plain?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={cn("shrink-0", className)} role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      <rect width="64" height="64" rx="14" fill="#111216" />
      {FACE.map((c, i) => (
        <rect key={i} x={5 + (i % 3) * 18.5} y={5 + Math.floor(i / 3) * 18.5} width="16.5" height="16.5" rx="4" fill={c} />
      ))}
    </svg>
  );
}

/** Mark + wordmark in Rubik. */
export function Logo({ className, size = 28 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-display text-[20px] font-extrabold leading-none tracking-[-0.03em]", className)}>
      <LogoMark size={size} />
      <span>Turn the Cube</span>
    </span>
  );
}
