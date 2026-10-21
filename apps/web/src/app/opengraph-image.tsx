import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "CantRug, the memecoin that cannot go to zero";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Site share card: typographic, the wordmark standing on the orange datum line. */
export default async function OpengraphImage() {
  const dir = join(process.cwd(), "assets", "fonts");
  const [bold, mono] = await Promise.all([readFile(join(dir, "inter-tight-latin-700-normal.woff")), readFile(join(dir, "jetbrains-mono-latin-400-normal.woff"))]);
  const ticks = Array.from({ length: 121 }, (_, i) => i * 10);
  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", justifyContent: "flex-end", background: "#141414", color: "#F2EFE9", fontFamily: "Inter Tight", position: "relative" }}>
        <svg width={1200} height={630} style={{ position: "absolute", left: 0, top: 0 }}>
          {ticks.map((x) => (
            <rect key={x} x={x} y={x % 50 === 0 ? 452 : 461} width={1.5} height={x % 50 === 0 ? 18 : 9} fill={x % 50 === 0 ? "#56544F" : "#3A3A38"} />
          ))}
          <rect x={0} y={470} width={1200} height={12} fill="#FF5F1F" />
          <rect x={0} y={482} width={1200} height={6} fill="#B8400E" />
        </svg>
        <div style={{ position: "absolute", left: 72, top: 150, display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 132, fontWeight: 700, letterSpacing: -5, lineHeight: 1 }}>CantRug</span>
          <span style={{ fontSize: 40, color: "#B3AFA6", marginTop: 18 }}>Pump burns your dead money. We give it back.</span>
        </div>
        <div style={{ position: "absolute", left: 72, right: 72, top: 508, display: "flex", justifyContent: "space-between", fontFamily: "JetBrains Mono", fontSize: 24, color: "#9A978F" }}>
          <span style={{ color: "#FF5F1F" }}>±0.00 floor = S / C</span>
          <span>The memecoin that cannot go to zero.</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter Tight", data: bold, weight: 700, style: "normal" },
        { name: "JetBrains Mono", data: mono, weight: 400, style: "normal" },
      ],
    },
  );
}
