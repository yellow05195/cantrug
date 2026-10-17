/**
 * Photography slots. One place to swap a picture for the whole site.
 *
 * Today these are Unsplash photographs (free licence, served from their CDN),
 * chosen for one subject: raw concrete, square geometry, hard light. They are
 * shown in grayscale with a touch more contrast so the only colour on a page
 * stays the orange floor line. The studio renders described in
 * assets/README.md replace them slot by slot when they are generated.
 */
export type Slot = { src: string; alt: { en: string; fr: string }; credit: string };

const u = (id: string) => `https://images.unsplash.com/photo-${id}`;

export const IMAGES = {
  /** Hero: a cantilevered concrete slab, the floor that holds. */
  hero: { src: u("1787228770216-669baf984e87"), alt: { en: "A cantilevered concrete slab", fr: "Une dalle de béton en porte-à-faux" }, credit: "Unsplash" },
  /** Step 1, the curve: a concrete ramp. */
  curve: { src: u("1529926279675-c72f1da4eb2a"), alt: { en: "A concrete ramp", fr: "Une rampe en béton" }, credit: "Unsplash" },
  /** Step 2, the floor: a block resting on the ground. */
  floor: { src: u("1649079800856-4b9c19d64ab4"), alt: { en: "A concrete block resting on the floor", fr: "Un bloc de béton posé au sol" }, credit: "Unsplash" },
  /** Step 3, the brake: a wide concrete staircase. */
  brake: { src: u("1583769925968-19a0ccef4158"), alt: { en: "A wide concrete staircase", fr: "Un large escalier en béton" }, credit: "Unsplash" },
  /** Trust: a sealed monolith, no door. */
  vault: { src: u("1651928944853-71ce4336e7ff"), alt: { en: "A sealed concrete monolith", fr: "Un monolithe de béton sans porte" }, credit: "Unsplash" },
  /** Closing band: concrete forms on a still horizon. */
  horizon: { src: u("1634573826817-27d9e8da08df"), alt: { en: "Concrete forms reflected on still water", fr: "Des volumes de béton reflétés sur une eau calme" }, credit: "Unsplash" },
  /** Challenge: dark concrete angles. */
  dark: { src: u("1619280771206-d8330a0be617"), alt: { en: "Dark concrete angles", fr: "Angles de béton sombre" }, credit: "Unsplash" },
} satisfies Record<string, Slot>;

export type ImageKey = keyof typeof IMAGES;
