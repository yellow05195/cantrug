import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { api, safely } from "@/lib/api/client";
import { metricsFromJson } from "@/lib/coin/metrics";
import { resolveCoin } from "@/lib/coin/resolve";
import { formatSignificant } from "@floored/sdk";
import { pct, solCompact } from "@/lib/format";

export const runtime = "nodejs";

const W = 1200;
const H = 630;
const C = { bg: "#141414", bg2: "#1C1C1B", line: "#2E2E2C", ink: "#EDEBE6", ink2: "#A5A29B", ink3: "#6F6D68", floor: "#FF5F1F", dim: "rgba(255,95,31,0.14)" };

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

export async function GET(_req: Request, ctx: { params: Promise<{ mint: string }> }) {
  const { mint } = await ctx.params;
  const [coin, f] = await Promise.all([resolveCoin(mint), loadFonts()]);
  const candles = coin ? await safely(api.candles(mint, "5m"), null) : null;

  const m = coin ? metricsFromJson(coin) : null;
  const graduated = m?.phase === "graduated";
  // The OG fonts are latin subsets without subscript digits: plain decimals here.
  const floorText = m ? formatSignificant(graduated ? m.floorSol : m.floorPreviewSol, 4) : "0";
  const gap = m && graduated && m.gapPct !== null ? `${pct(m.gapPct)} % above the floor` : m ? `${pct(m.progress * 100)} % to graduation` : "";

  // Price path over the last candles, scaled into the chart box; the floor sits on its own level.
  const box = { x: 64, y: 250, w: W - 128, h: 220 };
  const pts = (candles?.items ?? []).slice(-90).map((c) => c.display.close).filter((v) => v > 0);
  const floorVal = m ? (graduated ? m.floorSol : m.floorPreviewSol) : 0;
  const max = Math.max(...pts, floorVal * 1.2, 1e-18);
  const min = Math.min(0, floorVal * 0.6);
  const yOf = (v: number) => box.y + box.h - ((v - min) / (max - min || 1)) * box.h;
  const path = pts.length > 1 ? pts.map((v, i) => `${i ? "L" : "M"}${(box.x + (i / (pts.length - 1)) * box.w).toFixed(1)} ${yOf(v).toFixed(1)}`).join(" ") : "";
  const floorY = floorVal > 0 ? yOf(floorVal) : box.y + box.h * 0.75;

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: C.bg, color: C.ink, fontFamily: "Inter Tight", position: "relative" }}>
        <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
          <rect x={box.x} y={floorY} width={box.w} height={box.y + box.h + 60 - floorY} fill={C.dim} />
          {path ? <path d={path} stroke={C.ink3} strokeWidth={3} fill="none" /> : null}
          <rect x={box.x} y={floorY - 3} width={box.w} height={6} fill={C.floor} />
          <line x1={0} y1={H - 70} x2={W} y2={H - 70} stroke={C.line} strokeWidth={2} />
        </svg>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "48px 64px 0" }}>
          <svg width={40} height={40} viewBox="0 0 64 64">
            <rect x="4" y="52" width="56" height="8" fill={C.floor} />
            <path fill={C.ink} d="M14 6h36v10H26v10h20v10H26v16H14z" />
          </svg>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: 2 }}>FLOORED</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: "28px 64px 0" }}>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 640 }}>
            <span style={{ fontSize: 68, fontWeight: 700, letterSpacing: -2, lineHeight: 1 }}>{coin?.name ?? "Unknown coin"}</span>
            <span style={{ fontFamily: "JetBrains Mono", fontSize: 32, color: C.ink2, marginTop: 10 }}>${coin?.symbol ?? "?"}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{ fontSize: 22, color: C.ink2 }}>{graduated ? "Floor, SOL per token" : "Floor at graduation"}</span>
            <span style={{ fontFamily: "JetBrains Mono", fontWeight: 500, fontSize: 56, color: C.floor, lineHeight: 1.1 }}>{floorText}</span>
            <span style={{ fontFamily: "JetBrains Mono", fontSize: 24, color: C.ink, marginTop: 6 }}>{gap}</span>
          </div>
        </div>
        <div style={{ position: "absolute", left: box.x + 8, top: floorY + 14, display: "flex", fontFamily: "JetBrains Mono", fontSize: 20, color: C.floor }}>±0.00 floor</div>
        <div style={{ position: "absolute", left: 64, right: 64, bottom: 22, display: "flex", justifyContent: "space-between", fontFamily: "JetBrains Mono", fontSize: 20, color: C.ink3 }}>
          <span>{m ? `mcap ${solCompact(m.mcapLamports)} SOL` : ""}</span>
          <span>The memecoin that cannot go to zero.</span>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: f, headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
  );
}
