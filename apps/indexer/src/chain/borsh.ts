/**
 * Minimal borsh reader/writer: exactly the primitives the FLOORED IDL uses
 * (bool, u8, u16, u32, u64, i64, u128, pubkey, string, fixed u8 arrays,
 * nested structs). Integers wider than 32 bits are always bigint.
 */
import { PublicKey } from "@solana/web3.js";

export type Primitive = "bool" | "u8" | "u16" | "u32" | "u64" | "i64" | "u128" | "pubkey" | "string";
export type FieldType = Primitive | { array: ["u8", number] } | { struct: StructLayout };
export type StructLayout = ReadonlyArray<readonly [name: string, type: FieldType]>;

export class BorshReader {
  private offset = 0;
  constructor(private readonly buf: Uint8Array) {}

  get remaining(): number {
    return this.buf.length - this.offset;
  }

  private take(n: number): Uint8Array {
    if (this.offset + n > this.buf.length) {
      throw new RangeError(`borsh: read past end (need ${n} at ${this.offset}, have ${this.buf.length})`);
    }
    const out = this.buf.subarray(this.offset, this.offset + n);
    this.offset += n;
    return out;
  }

  private uintLE(n: number): bigint {
    const b = this.take(n);
    let v = 0n;
    for (let i = n - 1; i >= 0; i--) v = (v << 8n) | BigInt(b[i]!);
    return v;
  }

  bool(): boolean {
    const v = this.take(1)[0]!;
    if (v > 1) throw new RangeError(`borsh: invalid bool ${v}`);
    return v === 1;
  }
  u8(): number {
    return this.take(1)[0]!;
  }
  u16(): number {
    return Number(this.uintLE(2));
  }
  u32(): number {
    return Number(this.uintLE(4));
  }
  u64(): bigint {
    return this.uintLE(8);
  }
  i64(): bigint {
    return BigInt.asIntN(64, this.uintLE(8));
  }
  u128(): bigint {
    return this.uintLE(16);
  }
  pubkey(): string {
    return new PublicKey(this.take(32)).toBase58();
  }
  string(): string {
    const len = this.u32();
    return new TextDecoder("utf-8", { fatal: true }).decode(this.take(len));
  }
  bytes(n: number): Uint8Array {
    return this.take(n).slice();
  }

  read(t: FieldType): unknown {
    if (typeof t === "string") return this[t]();
    if ("array" in t) return this.bytes(t.array[1]);
    return this.struct(t.struct);
  }

  struct(layout: StructLayout): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [name, type] of layout) out[name] = this.read(type);
    return out;
  }
}

export class BorshWriter {
  private chunks: Uint8Array[] = [];

  private uintLE(v: bigint, n: number): void {
    if (v < 0n || v >= 1n << BigInt(8 * n)) throw new RangeError(`borsh: ${v} does not fit in ${n} bytes`);
    const b = new Uint8Array(n);
    let x = v;
    for (let i = 0; i < n; i++) {
      b[i] = Number(x & 0xffn);
      x >>= 8n;
    }
    this.chunks.push(b);
  }

  raw(b: Uint8Array): this {
    this.chunks.push(b);
    return this;
  }
  bool(v: boolean): this {
    this.chunks.push(Uint8Array.of(v ? 1 : 0));
    return this;
  }
  u8(v: number): this {
    this.uintLE(BigInt(v), 1);
    return this;
  }
  u16(v: number): this {
    this.uintLE(BigInt(v), 2);
    return this;
  }
  u32(v: number): this {
    this.uintLE(BigInt(v), 4);
    return this;
  }
  u64(v: bigint): this {
    this.uintLE(v, 8);
    return this;
  }
  i64(v: bigint): this {
    this.uintLE(BigInt.asUintN(64, v), 8);
    return this;
  }
  u128(v: bigint): this {
    this.uintLE(v, 16);
    return this;
  }
  pubkey(v: string): this {
    this.chunks.push(new PublicKey(v).toBytes());
    return this;
  }
  string(v: string): this {
    const b = new TextEncoder().encode(v);
    this.u32(b.length);
    this.chunks.push(b);
    return this;
  }

  write(t: FieldType, v: unknown): this {
    if (typeof t === "string") {
      switch (t) {
        case "bool":
          return this.bool(v as boolean);
        case "u8":
        case "u16":
        case "u32":
          return this[t](v as number);
        case "u64":
        case "i64":
        case "u128":
          return this[t](v as bigint);
        case "pubkey":
        case "string":
          return this[t](v as string);
      }
    }
    if ("array" in t) {
      const b = v as Uint8Array;
      if (b.length !== t.array[1]) throw new RangeError(`borsh: expected ${t.array[1]} bytes`);
      return this.raw(b);
    }
    return this.struct(t.struct, v as Record<string, unknown>);
  }

  struct(layout: StructLayout, v: Record<string, unknown>): this {
    for (const [name, type] of layout) this.write(type, v[name]);
    return this;
  }

  toBytes(): Uint8Array {
    const len = this.chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(len);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}
