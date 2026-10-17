/* Tiny 2D pixel canvas that serializes to run-length-encoded SVG rects. Scenes are painted on a small grid and upscaled crisply. */

export class PixelCanvas {
  readonly w: number;
  readonly h: number;
  private grid: (string | null)[];

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.grid = new Array<string | null>(w * h).fill(null);
  }

  set(x: number, y: number, color: string): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    this.grid[yi * this.w + xi] = color;
  }

  get(x: number, y: number): string | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.grid[y * this.w + x] ?? null;
  }

  fillRect(x: number, y: number, w: number, h: number, color: string): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, color);
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, color: string): void {
    if (rx <= 0 || ry <= 0) return;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, color);
      }
    }
  }

  /** Serialize to SVG rects, merging horizontal runs of the same colour. Inner markup only. */
  toSvgRects(): string {
    const parts: string[] = [];
    for (let y = 0; y < this.h; y++) {
      let x = 0;
      while (x < this.w) {
        const c = this.get(x, y);
        if (c === null) {
          x++;
          continue;
        }
        let run = 1;
        while (x + run < this.w && this.get(x + run, y) === c) run++;
        parts.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${c}"/>`);
        x += run;
      }
    }
    return parts.join("");
  }
}
