/** Deep-convert a value to JSON-safe data: bigint → decimal string, bytes → base64, Date → ISO. */
export function toJsonSafe(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Uint8Array) return Buffer.from(v).toString("base64");
  if (Array.isArray(v)) return v.map(toJsonSafe);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = toJsonSafe(x);
    return out;
  }
  return v;
}
