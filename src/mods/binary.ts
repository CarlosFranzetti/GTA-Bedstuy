import { ModError } from './limits';

/** Bounds-checked little-endian reader. Any read past the end throws ModError('truncated'); nothing here allocates from a file-supplied size. */
export class ByteReader {
  readonly view: DataView;
  pos: number;
  readonly end: number;

  constructor(readonly buf: ArrayBuffer | Uint8Array, start = 0, end?: number) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    this.view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    this.pos = start;
    this.end = Math.min(end ?? u8.byteLength, u8.byteLength);
  }

  get remaining(): number { return this.end - this.pos; }

  private need(n: number): void {
    if (n < 0 || this.pos + n > this.end) throw new ModError('The file is cut short (it ends in the middle of a record).', 'truncated');
  }
  u8(): number { this.need(1); return this.view.getUint8(this.pos++); }
  u16(): number { this.need(2); const v = this.view.getUint16(this.pos, true); this.pos += 2; return v; }
  i32(): number { this.need(4); const v = this.view.getInt32(this.pos, true); this.pos += 4; return v; }
  u32(): number { this.need(4); const v = this.view.getUint32(this.pos, true); this.pos += 4; return v; }
  f32(): number {
    this.need(4);
    const v = this.view.getFloat32(this.pos, true); this.pos += 4;
    return Number.isFinite(v) ? v : 0;
  }
  skip(n: number): void { this.need(n); this.pos += n; }
  bytes(n: number): Uint8Array {
    this.need(n);
    const out = new Uint8Array(this.view.buffer, this.view.byteOffset + this.pos, n);
    this.pos += n;
    return out;
  }
  /** NUL-terminated ASCII in a fixed field of `n` bytes. */
  fixedString(n: number): string {
    const b = this.bytes(n);
    let s = '';
    for (let i = 0; i < b.length && b[i] !== 0; i++) s += String.fromCharCode(b[i] & 0x7f);
    return s;
  }
}
