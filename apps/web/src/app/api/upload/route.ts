/**
 * Coin image + metadata JSON uploader (Vercel Blob). Same-origin, public
 * read, random file names. Nothing here is trusted: types and sizes are
 * checked and the JSON is re-serialised after parsing.
 *
 * Needs `BLOB_READ_WRITE_TOKEN` (set automatically when a Blob store is linked
 * to the Vercel project). Without it the route answers 503 and the create
 * form falls back to its dev stub.
 */
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE = 4 * 1024 * 1024;
const MAX_JSON = 64 * 1024;
const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function bad(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return bad(503, "uploads are not configured on this deployment");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad(400, "expected multipart form data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return bad(400, "missing file field");

  const isJson = file.type === "application/json" || /\.json$/i.test(file.name);
  if (isJson) {
    if (file.size > MAX_JSON) return bad(413, "metadata is too large");
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return bad(400, "metadata is not valid JSON");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return bad(400, "metadata must be a JSON object");
    const body = JSON.stringify(parsed);
    const blob = await put(`meta/${crypto.randomUUID()}.json`, body, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      cacheControlMaxAge: 31536000,
    });
    return NextResponse.json({ url: blob.url });
  }

  const ext = IMAGE_TYPES[file.type];
  if (!ext) return bad(415, "image must be PNG, JPEG, WebP or GIF");
  if (file.size > MAX_IMAGE) return bad(413, "image must be 4 MB or less");
  const blob = await put(`img/${crypto.randomUUID()}.${ext}`, file, {
    access: "public",
    contentType: file.type,
    addRandomSuffix: false,
    cacheControlMaxAge: 31536000,
  });
  return NextResponse.json({ url: blob.url });
}
