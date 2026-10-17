/**
 * Minimal Borsh reader / writer and Anchor discriminators. Hand-rolled to
 * avoid depending on @coral-xyz/anchor and its IDL-version coupling.
 */
import { Buffer } from "buffer";
import { PublicKey } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { U64_MAX, U128_MAX } from "./math.js";

/** `sha256("<namespace>:<name>")[0..8]`. */
export function discriminator(namespace: string, name: string): Buffer {
  return Buffer.from(sha256(new TextEncoder().encode(`${namespace}:${name}`)).subarray(0, 8));
}
export const instructionDiscriminator = (name: string) => discriminator("global", name);
export const accountDiscriminator = (name: string) => discriminator("account", name);
export const eventDiscriminator = (name: string) => discriminator("event", name);

export class BorshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BorshError";
  }
}

export class BorshReader {
  private off = 0;
  private readonly buf: Buffer;

  constructor(data: Uint8Array, offset = 0) {
    this.buf = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    this.off = offset;
  }

  get offset(): number {
    return this.off;
  }
  get remaining(): number {
    return this.buf.length - this.off;
  }

  private need(n: number): void {
    if (this.off + n > this.buf.length) {
      throw new BorshError(`unexpected end of data: need ${n} bytes at offset ${this.off}, have ${this.remaining}`);
    }
  }

  u8(): number {
    this.need(1);
    return this.buf.readUInt8(this.off++);
  }
  bool(): boolean {
    const v = this.u8();
    if (v > 1) throw new BorshError(`invalid bool byte ${v}`);
    return v === 1;
  }
  u16(): number {
    this.need(2);
    const v = this.buf.readUInt16LE(this.off);
    this.off += 2;
    return v;
  }
  u32(): number {
    this.need(4);
    const v = this.buf.readUInt32LE(this.off);
    this.off += 4;
    return v;
  }
  u64(): bigint {
    this.need(8);
    const v = this.buf.readBigUInt64LE(this.off);
    this.off += 8;
    return v;
  }
  i64(): bigint {
    this.need(8);
    const v = this.buf.readBigInt64LE(this.off);
    this.off += 8;
    return v;
  }
  u128(): bigint {
    const lo = this.u64();
    const hi = this.u64();
    return (hi << 64n) | lo;
  }
  pubkey(): PublicKey {
    return new PublicKey(this.bytes(32));
  }
  bytes(n: number): Uint8Array {
    this.need(n);
    const out = new Uint8Array(this.buf.subarray(this.off, this.off + n));
    this.off += n;
    return out;
  }
  string(): string {
    const len = this.u32();
    this.need(len);
    const s = this.buf.toString("utf8", this.off, this.off + len);
    this.off += len;
    return s;
  }
}

export class BorshWriter {
  private readonly chunks: Buffer[] = [];

  raw(b: Uint8Array): this {
    this.chunks.push(Buffer.from(b));
    return this;
  }
  u8(v: number): this {
    if (!Number.isInteger(v) || v < 0 || v > 0xff) throw new RangeError(`not a u8: ${v}`);
    const b = Buffer.alloc(1);
    b.writeUInt8(v);
    return this.raw(b);
  }
  bool(v: boolean): this {
    return this.u8(v ? 1 : 0);
  }
  u16(v: number): this {
    if (!Number.isInteger(v) || v < 0 || v > 0xffff) throw new RangeError(`not a u16: ${v}`);
    const b = Buffer.alloc(2);
    b.writeUInt16LE(v);
    return this.raw(b);
  }
  u32(v: number): this {
    if (!Number.isInteger(v) || v < 0 || v > 0xffff_ffff) throw new RangeError(`not a u32: ${v}`);
    const b = Buffer.alloc(4);
    b.writeUInt32LE(v);
    return this.raw(b);
  }
  u64(v: bigint | number): this {
    const n = BigInt(v);
    if (n < 0n || n > U64_MAX) throw new RangeError(`not a u64: ${n}`);
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(n);
    return this.raw(b);
  }
  i64(v: bigint | number): this {
    const b = Buffer.alloc(8);
    b.writeBigInt64LE(BigInt(v));
    return this.raw(b);
  }
  u128(v: bigint): this {
    if (v < 0n || v > U128_MAX) throw new RangeError(`not a u128: ${v}`);
    return this.u64(v & U64_MAX).u64(v >> 64n);
  }
  pubkey(k: PublicKey): this {
    return this.raw(k.toBuffer());
  }
  string(s: string): this {
    const b = Buffer.from(s, "utf8");
    return this.u32(b.length).raw(b);
  }
  option<T>(v: T | null | undefined, write: (w: this, v: T) => void): this {
    if (v === null || v === undefined) return this.u8(0);
    this.u8(1);
    write(this, v);
    return this;
  }
  toBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }
}
