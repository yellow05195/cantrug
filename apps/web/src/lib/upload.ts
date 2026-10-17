/**
 * Pluggable uploader for coin images and metadata JSON.
 * - NEXT_PUBLIC_UPLOAD_URL set: POST multipart `file` to it, expects `{ "url": "https://..." }`.
 * - otherwise: a dev stub that returns data URLs (fine in mock mode; on chain the
 *   metadata URI is limited to 200 bytes, so a real uploader is required there).
 */
import { ENV } from "@/lib/env";

export interface Uploader {
  uploadImage(file: File): Promise<string>;
  uploadJson(json: unknown): Promise<string>;
}

async function post(body: Blob, name: string): Promise<string> {
  const form = new FormData();
  form.append("file", body, name);
  const res = await fetch(ENV.uploadUrl, { method: "POST", body: form });
  if (!res.ok) throw new Error(`upload failed (${res.status})`);
  const j = (await res.json()) as { url?: string; uri?: string };
  const url = j.url ?? j.uri;
  if (!url) throw new Error("upload response has no url");
  return url;
}

const httpUploader: Uploader = {
  uploadImage: (file) => post(file, file.name || "image"),
  uploadJson: (json) => post(new Blob([JSON.stringify(json)], { type: "application/json" }), "metadata.json"),
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Downscale to 256 px so the data URL stays small. */
async function shrink(file: File): Promise<string> {
  const src = await fileToDataUrl(file);
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const size = 256;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    if (!ctx) return src;
    const s = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    return c.toDataURL("image/webp", 0.82);
  } catch {
    return src;
  }
}

const devUploader: Uploader = {
  uploadImage: (file) => shrink(file),
  uploadJson: async (json) => `data:application/json,${encodeURIComponent(JSON.stringify(json))}`,
};

export const uploader: Uploader = ENV.uploadUrl ? httpUploader : devUploader;
export const hasRealUploader = Boolean(ENV.uploadUrl);
