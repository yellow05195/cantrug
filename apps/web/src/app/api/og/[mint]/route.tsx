import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { formatSignificant } from "@floored/sdk";
import { ImageResponse } from "next/og";
import { BuildingSvg, buildingSpec, type BuildingColors } from "@/components/coin/BuildingAvatar";
import { metricsFromJson } from "@/lib/coin/metrics";
import { resolveCoin } from "@/lib/coin/resolve";
import { pct, solCompact } from "@/lib/format";

export const runtime = "nodejs";

const W = 1200;
const H = 630;
const C = { bg: "#141414", bg2: "#1C1C1B", bg3: "#262624", stroke: "#3A3A38", strokeStrong: "#56544F", ink: "#F2EFE9", ink2: "#B3AFA6", ink3: "#9A978F", floor: "#FF5F1F", floorDeep: "#B8400E", dot: "#2E2E2C" };
const OG_BUILDING: BuildingColors = { sky: C.bg2, greys: ["#55534e", "#6a6761", "#7f7c75", "#4a4843"], edge: "#121211", dark: "#2b2a27", light: C.floor, slab: C.floor, star: C.ink3 };

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 500 | 600 | 700; style: "normal" }[]> | null = null;
function loadFonts() {
  if (!fonts) {
    const dir = join(process.cwd(), "assets", "fonts");
    fonts = Promise.all([
      readFile(join(dir, "inter-tight-latin-600-normal.woff")).then((data) => ({ name: "Inter Tight", data, weight: 600 as const, style: "normal" as const })),
      readFile(join(dir, "inter-tight-latin-700-normal.woff")).then((data) => ({ name: "Inter Tight", data, weight: 700 as const, style: "normal" as const })),
      readFile(join(dir, "jetbrains-mono-latin-400-normal.woff")).then((data) => ({ name: "JetBrains Mono", data, weight: 400 as const, style: "normal" as const })),
      readFile(join(dir, "jetbrains-mono-latin-500-normal.woff")).then((data) => ({ name: "JetBrains Mono", data, weight: 500 as const, style: "normal" as const })),
    ]);
  }
  return fonts;
}

/**
 * The share card, all typographic (no photo): dark concrete, the drafting dot
 * grid, the coin's building, name, ticker, floor and gap, and the orange datum
 * line with its ruler and the ±0.00 level mark.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ mint: string }> }) {
  const { mint } = await ctx.params;
  const [coin, f] = await Promise.all([resolveCoin(mint), loadFonts()]);
  const m = coin ? metricsFromJson(coin) : null;
  const graduated = m?.phase === "graduated";
  // The OG fonts are latin subsets without subscript digits: plain decimals here.
  const floorText = m ? formatSignificant(graduated ? m.floorSol : m.floorPreviewSol, 4) : "0";
  const gap = m && graduated && m.gapPct !== null ? `${pct(m.gapPct)} % above the floor` : m ? `${pct(m.progress * 100)} % to graduation` : "";
  const datumY = 520;

  const dots: { x: number; y: number }[] = [];
  for (let x = 20; x < W; x += 40) for (let y = 20; y < datumY - 20; y += 40) dots.push({ x, y });
  const ticks = Array.from({ length: Math.floor(W / 10) + 1 }, (_, i) => i * 10);

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: C.bg, color: C.ink, fontFamily: "Inter Tight", position: "relative" }}>
        <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
          {dots.map((d, i) => (
            <rect key={i} x={d.x} y={d.y} width={2} height={2} fill={C.dot} />
          ))}
          {ticks.map((x) => (
            <rect key={x} x={x} y={x % 50 === 0 ? datumY - 18 : datumY - 9} width={1.5} height={x % 50 === 0 ? 18 : 9} fill={x % 50 === 0 ? C.strokeStrong : C.stroke} />
          ))}
          <rect x={0} y={datumY} width={W} height={10} fill={C.floor} />
          <rect x={0} y={datumY + 10} width={W} height={5} fill={C.floorDeep} />
        </svg>

        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "44px 64px 0" }}>
          <svg width={40} height={40} viewBox="0 0 64 64">
            <rect x="4" y="52" width="56" height="8" fill={C.floor} />
            <path fill={C.ink} d="M14 6h36v10H26v10h20v10H26v16H14z" />
          </svg>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: 2 }}>Turn the Cube</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 36, padding: "56px 64px 0" }}>
          <div style={{ display: "flex", width: 176, height: 176, borderRadius: 24, border: `4px solid ${C.stroke}`, overflow: "hidden", boxShadow: `0 8px 0 0 #0a0a0a` }}>
            <BuildingSvg spec={buildingSpec(mint)} colors={OG_BUILDING} size={168} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 76, fontWeight: 700, letterSpacing: -2.5, lineHeight: 1 }}>{coin?.name ?? "Unknown coin"}</span>
            <span style={{ fontFamily: "JetBrains Mono", fontSize: 32, color: C.ink2, marginTop: 12 }}>${coin?.symbol ?? "?"}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{ fontSize: 22, color: C.ink2 }}>{graduated ? "Floor, SOL per token" : "Floor at graduation"}</span>
            <span style={{ fontFamily: "JetBrains Mono", fontWeight: 500, fontSize: 54, color: C.floor, lineHeight: 1.15 }}>{floorText}</span>
            <span style={{ fontFamily: "JetBrains Mono", fontSize: 24, color: C.ink, marginTop: 4 }}>{gap}</span>
          </div>
        </div>

        <div style={{ position: "absolute", left: 64, right: 64, top: datumY + 26, display: "flex", justifyContent: "space-between", fontFamily: "JetBrains Mono", fontSize: 20, color: C.ink3 }}>
          <span style={{ color: C.floor }}>±0.00 floor</span>
          <span>{m ? `mcap ${solCompact(m.mcapLamports)} SOL` : ""}</span>
          <span>The memecoin that cannot go to zero.</span>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: f, headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
  );
}
