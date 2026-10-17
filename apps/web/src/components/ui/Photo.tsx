import Image from "next/image";
import { useLocale } from "next-intl";
import type { ReactNode } from "react";
import { IMAGES, type ImageKey } from "@/lib/images";
import { cn } from "@/lib/cn";

/**
 * A photograph in the house frame: square corners, one hairline, grayscale
 * with a touch more contrast so the only colour on the page stays the floor
 * line. An optional caption bar sits under the picture like a plate label.
 */
export function Photo({
  id,
  ratio = "1/1",
  sizes = "(min-width: 1024px) 480px, 100vw",
  priority,
  caption,
  className,
}: {
  id: ImageKey;
  ratio?: "1/1" | "4/3" | "3/2" | "16/9" | "21/9" | "4/5";
  sizes?: string;
  priority?: boolean;
  caption?: ReactNode;
  className?: string;
}) {
  const locale = useLocale() === "fr" ? "fr" : "en";
  const img = IMAGES[id];
  return (
    <figure className={cn("border border-line bg-bg-2", className)}>
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: ratio.replace("/", " / ") }}>
        <Image src={img.src} alt={img.alt[locale]} fill sizes={sizes} priority={priority} quality={78} className="object-cover [filter:grayscale(1)_contrast(1.08)_brightness(.92)]" />
      </div>
      {caption ? <figcaption className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 text-xs text-ink-3">{caption}</figcaption> : null}
    </figure>
  );
}
