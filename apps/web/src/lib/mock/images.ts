/**
 * Mock coin images: flat SVG tiles (no orange, it belongs to the floor).
 * Real coins carry user images from their metadata URI.
 */
const PALETTES: [string, string, string][] = [
  ["#2f4f4a", "#8fb3a6", "#e7efe9"],
  ["#4a3f5c", "#a79bc4", "#efeaf6"],
  ["#3d4a5e", "#94a7c4", "#e9eef6"],
  ["#5a4a2c", "#c9b27a", "#f5efe0"],
  ["#4d5a3a", "#a9bb86", "#eef3e4"],
  ["#5c3a44", "#c48f9d", "#f6e9ec"],
  ["#2e3d4f", "#7fa0bf", "#e6eef6"],
  ["#4f4f4a", "#b5b3a8", "#f1f0ec"],
];

export function coinImage(symbol: string, variant: number): string {
  const [bg, mid, fg] = PALETTES[variant % PALETTES.length]!;
  const letter = symbol.slice(0, 1);
  const shape = variant % 4;
  const shapes = [
    `<rect x="8" y="40" width="48" height="16" fill="${mid}"/>`,
    `<circle cx="44" cy="20" r="12" fill="${mid}"/>`,
    `<path d="M0 64 L64 24 L64 64 Z" fill="${mid}"/>`,
    `<rect x="36" y="6" width="22" height="22" fill="${mid}"/>`,
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/>${shapes[shape]}<text x="10" y="${shape === 0 ? 34 : 50}" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="30" fill="${fg}">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
