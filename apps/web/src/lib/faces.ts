import type { FaceColors } from "@/components/home/Cube";

/*
 * Every page is a face of the cube. One colour per page, used for its header
 * band, its nav sticker and its little cube. Text on red and blue is white,
 * on the other four it is ink.
 */
export type Face = "white" | "red" | "orange" | "yellow" | "green" | "blue";

export const FACE_OF = {
  coins: "green",
  create: "orange",
  portfolio: "blue",
  how: "yellow",
  stats: "red",
  challenge: "red",
} as const satisfies Record<string, Face>;

export const FACE_BG: Record<Face, string> = {
  white: "bg-cube-white",
  red: "bg-cube-red",
  orange: "bg-cube-orange",
  yellow: "bg-cube-yellow",
  green: "bg-cube-green",
  blue: "bg-cube-blue",
};

export const FACE_ON_DARK: Record<Face, boolean> = { white: false, red: true, orange: false, yellow: false, green: false, blue: true };

/** Text colour that reads on a face. */
export const faceText = (f: Face) => (FACE_ON_DARK[f] ? "text-white" : "text-ink");

const VAR: Record<Face, string> = {
  white: "var(--cube-white)",
  red: "var(--cube-red)",
  orange: "var(--cube-orange)",
  yellow: "var(--cube-yellow)",
  green: "var(--cube-green)",
  blue: "var(--cube-blue)",
};
export const faceVar = (f: Face) => VAR[f];

/** Cube colours with `f` on the front; the two other visible faces stay varied. */
const OPPOSITE: Record<Face, Face> = { white: "yellow", yellow: "white", red: "orange", orange: "red", green: "blue", blue: "green" };
export function cubeWithFront(f: Face): FaceColors {
  const order: Face[] = ["white", "red", "green", "yellow", "orange", "blue"].filter((c) => c !== f && c !== OPPOSITE[f]) as Face[];
  return {
    front: VAR[f],
    back: VAR[OPPOSITE[f]],
    top: VAR[order[0]!],
    bottom: VAR[OPPOSITE[order[0]!]],
    right: VAR[order[1]!],
    left: VAR[OPPOSITE[order[1]!]],
  };
}
