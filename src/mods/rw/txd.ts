/**
 * RenderWare .txd (texture dictionary) reader for the PC platforms (Direct3D 8 and 9 native textures).
 *
 * Written from the publicly documented chunk layout. A dictionary chunk holds a struct (texture count) and one "texture
 * native" chunk per texture. Each native texture: platform id u32, filter and address bytes, name[32], mask name[32],
 * raster format u32 (bits 8..11 pixel format, 0x2000 8-bit palette, 0x4000 4-bit palette, 0x8000 has mip levels), a
 * compression field (D3D8: alpha flag; D3D9: a four-character code such as DXT1), width, height, depth, mip count, raster
 * type, DXT type byte, then the palette (RGBA) when palettised and one data block per mip level, each led by its byte size.
 * Only the largest level is decoded, to 8-bit RGBA; the other levels are skipped by their stated sizes.
 *
 * Decoded: 8-bit and 4-bit palettised, 16-bit (1555, 565, 4444, 555), 24 and 32-bit (888, 8888), DXT1, DXT3, DXT5.
 * Not decoded: PlayStation 2 and Xbox native rasters, volume and cube maps, luminance. Those textures are skipped with a note.
 */
import { ByteReader } from '../binary';
import { ModError, type ModLimits } from '../limits';
import { RW, eachChunk, readHeader } from './dff';

export interface TxdTexture {
  name: string;
  mask: string;
  width: number;
  height: number;
  /** width * height * 4 bytes, R G B A */
  rgba: Uint8Array;
  hasAlpha: boolean;
  /** how it was stored, for the panel */
  encoding: string;
}
export interface TxdResult { textures: TxdTexture[]; skipped: string[] }

const FMT_1555 = 0x100, FMT_565 = 0x200, FMT_4444 = 0x300, FMT_LUM8 = 0x400, FMT_8888 = 0x500, FMT_888 = 0x600, FMT_555 = 0x700;
const PAL8 = 0x2000, PAL4 = 0x4000;
const FOURCC = (s: string): number => s.charCodeAt(0) | (s.charCodeAt(1) << 8) | (s.charCodeAt(2) << 16) | (s.charCodeAt(3) << 24);
const DXT1 = FOURCC('DXT1'), DXT3 = FOURCC('DXT3'), DXT5 = FOURCC('DXT5');

export function parseTxd(data: ArrayBuffer | Uint8Array, limits: ModLimits): TxdResult {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (u8.byteLength > limits.maxTextureFileBytes) throw new ModError(`This texture file is too large for this device (${(u8.byteLength / 1048576).toFixed(1)} MB; the limit is ${(limits.maxTextureFileBytes / 1048576).toFixed(0)} MB).`, 'oversize');
  if (u8.byteLength < 24) throw new ModError('This is not a RenderWare .txd file (too short).', 'format');
  const r = new ByteReader(u8);
  const top = readHeader(r, u8.byteLength);
  if (top.type !== RW.TEXTURE_DICTIONARY) throw new ModError('This is not a RenderWare .txd (the first chunk is not a Texture Dictionary).', 'format');
  const out: TxdResult = { textures: [], skipped: [] };
  let budget = limits.maxDecodedTextureBytes;
  eachChunk(r, top.body, top.end, (h) => {
    if (h.type !== RW.TEXTURE_NATIVE) return;
    if (out.textures.length + out.skipped.length >= limits.maxTexturesPerTxd) throw new ModError(`The dictionary holds more than ${limits.maxTexturesPerTxd} textures; this device allows that many.`, 'oversize');
    const t = parseNative(new ByteReader(u8, h.body, h.end), limits, budget, out.skipped);
    if (t) { budget -= t.rgba.byteLength; out.textures.push(t); }
  });
  return out;
}

function parseNative(r: ByteReader, limits: ModLimits, budget: number, skipped: string[]): TxdTexture | null {
  // the struct chunk wraps the whole description
  const sh = readHeader(r, r.end);
  if (sh.type !== RW.STRUCT) throw new ModError('A texture has no data block.', 'format');
  const s = new ByteReader(r.buf, sh.body, sh.end);
  const platform = s.u32();
  s.u32(); // filter + address
  const name = s.fixedString(32), mask = s.fixedString(32);
  if (platform !== 8 && platform !== 9) { skipped.push(`${name || '(unnamed)'}: platform ${platform} is not a PC Direct3D texture`); return null; }
  const raster = s.u32();
  const compField = s.u32();
  const width = s.u16(), height = s.u16();
  const depth = s.u8(), mips = s.u8(), rasterType = s.u8(), dxtByte = s.u8();
  if (rasterType !== 4) { skipped.push(`${name}: raster type ${rasterType} (only plain 2D textures are read)`); return null; }
  if (width < 1 || height < 1 || width > limits.maxTextureDim || height > limits.maxTextureDim) {
    throw new ModError(`The texture "${name}" is ${width} x ${height}; this device allows up to ${limits.maxTextureDim} x ${limits.maxTextureDim}.`, 'oversize');
  }
  if (width * height * 4 > budget) throw new ModError(`The textures of this file need more memory than this device allows for one mod (${Math.round(limits.maxDecodedTextureBytes / 1048576)} MB).`, 'oversize');
  if (mips === 0 || mips > 16) throw new ModError(`The texture "${name}" has an impossible mip count.`, 'format');

  let dxt = 0; // 0 none, 1, 3, 5
  if (platform === 8) { if (dxtByte === 1 || dxtByte === 2 || dxtByte === 3 || dxtByte === 4 || dxtByte === 5) dxt = dxtByte === 1 ? 1 : dxtByte === 5 ? 5 : 3; }
  else if (compField === DXT1) dxt = 1; else if (compField === DXT3) dxt = 3; else if (compField === DXT5) dxt = 5;
  const fmt = raster & 0xf00;
  const alphaFlag = platform === 8 ? compField !== 0 : (dxtByte & 1) !== 0;

  let palette: Uint8Array | null = null;
  let palSize = 0;
  if (raster & PAL8) palSize = 256; else if (raster & PAL4) palSize = 32;
  if (palSize) palette = Uint8Array.from(s.bytes(palSize * 4));

  const size = s.u32();
  if (size > s.remaining) throw new ModError(`The texture "${name}" is cut short.`, 'truncated');
  const px = s.bytes(size);
  const rgba = new Uint8Array(width * height * 4);
  let encoding = '';
  let hasAlpha = alphaFlag;

  if (dxt) {
    const bs = dxt === 1 ? 8 : 16;
    const expect = Math.ceil(width / 4) * Math.ceil(height / 4) * bs;
    if (size < expect) throw new ModError(`The compressed texture "${name}" is shorter than its size says.`, 'truncated');
    decodeDxt(px, width, height, dxt as 1 | 3 | 5, rgba);
    encoding = `DXT${dxt}`;
    hasAlpha = dxt !== 1 || hasOpaqueAlpha(rgba);
  } else if (palette) {
    const n = raster & PAL8 ? width * height : Math.ceil(width * height / 2);
    if (size < n) throw new ModError(`The palettised texture "${name}" is shorter than its size says.`, 'truncated');
    for (let i = 0; i < width * height; i++) {
      const idx = raster & PAL8 ? px[i] : (i & 1 ? px[i >> 1] >> 4 : px[i >> 1] & 15);
      const o = idx * 4, d = i * 4;
      rgba[d] = palette[o]; rgba[d + 1] = palette[o + 1]; rgba[d + 2] = palette[o + 2]; rgba[d + 3] = palette[o + 3];
    }
    encoding = raster & PAL8 ? 'palette 8-bit' : 'palette 4-bit';
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) { hasAlpha = true; break; }
  } else {
    const bpp = size / (width * height);
    if (bpp >= 4 && Number.isInteger(bpp)) {
      for (let i = 0; i < width * height; i++) { const o = i * 4; rgba[o] = px[o + 2]; rgba[o + 1] = px[o + 1]; rgba[o + 2] = px[o]; rgba[o + 3] = fmt === FMT_888 ? 255 : px[o + 3]; }
      encoding = fmt === FMT_888 ? '32-bit (888)' : '32-bit (8888)';
      if (fmt !== FMT_888) hasAlpha = true;
    } else if (bpp === 3 || (fmt === FMT_888 && depth === 24)) {
      if (size < width * height * 3) throw new ModError(`The texture "${name}" is shorter than its size says.`, 'truncated');
      for (let i = 0; i < width * height; i++) { rgba[i * 4] = px[i * 3 + 2]; rgba[i * 4 + 1] = px[i * 3 + 1]; rgba[i * 4 + 2] = px[i * 3]; rgba[i * 4 + 3] = 255; }
      encoding = '24-bit';
    } else if (bpp >= 2 && (fmt === FMT_1555 || fmt === FMT_565 || fmt === FMT_4444 || fmt === FMT_555)) {
      if (size < width * height * 2) throw new ModError(`The texture "${name}" is shorter than its size says.`, 'truncated');
      const v = new DataView(px.buffer, px.byteOffset, px.byteLength);
      const e5 = (x: number): number => (x << 3) | (x >> 2), e6 = (x: number): number => (x << 2) | (x >> 4);
      for (let i = 0; i < width * height; i++) {
        const p = v.getUint16(i * 2, true), o = i * 4;
        if (fmt === FMT_565) { rgba[o] = e5(p >> 11 & 31); rgba[o + 1] = e6(p >> 5 & 63); rgba[o + 2] = e5(p & 31); rgba[o + 3] = 255; }
        else if (fmt === FMT_4444) { rgba[o] = (p >> 8 & 15) * 17; rgba[o + 1] = (p >> 4 & 15) * 17; rgba[o + 2] = (p & 15) * 17; rgba[o + 3] = (p >> 12 & 15) * 17; }
        else { rgba[o] = e5(p >> 10 & 31); rgba[o + 1] = e5(p >> 5 & 31); rgba[o + 2] = e5(p & 31); rgba[o + 3] = fmt === FMT_1555 ? (p & 0x8000 ? 255 : 0) : 255; }
      }
      encoding = fmt === FMT_565 ? '16-bit (565)' : fmt === FMT_4444 ? '16-bit (4444)' : fmt === FMT_555 ? '16-bit (555)' : '16-bit (1555)';
      hasAlpha = fmt === FMT_4444 || fmt === FMT_1555;
    } else {
      skipped.push(`${name}: pixel format 0x${fmt.toString(16)} (${depth}-bit) is not supported`);
      return null;
    }
  }
  return { name: name.toLowerCase(), mask: mask.toLowerCase(), width, height, rgba, hasAlpha, encoding };
}

function hasOpaqueAlpha(rgba: Uint8Array): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 255) return true;
  return false;
}

function c565(c: number, out: number[], o: number): void {
  const r = c >> 11 & 31, g = c >> 5 & 63, b = c & 31;
  out[o] = (r << 3) | (r >> 2); out[o + 1] = (g << 2) | (g >> 4); out[o + 2] = (b << 3) | (b >> 2);
}

/** S3 block compression, written from the published block layout. */
export function decodeDxt(src: Uint8Array, w: number, h: number, kind: 1 | 3 | 5, dst: Uint8Array): void {
  const bw = Math.ceil(w / 4), bh = Math.ceil(h / 4), bs = kind === 1 ? 8 : 16;
  const pal = new Array<number>(16), alpha = new Array<number>(16);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const o = (by * bw + bx) * bs;
      const co = kind === 1 ? o : o + 8;
      const c0 = src[co] | (src[co + 1] << 8), c1 = src[co + 2] | (src[co + 3] << 8);
      c565(c0, pal, 0); c565(c1, pal, 4);
      const opaque4 = kind !== 1 || c0 > c1;
      for (let k = 0; k < 3; k++) {
        if (opaque4) { pal[8 + k] = Math.floor((2 * pal[k] + pal[4 + k]) / 3); pal[12 + k] = Math.floor((pal[k] + 2 * pal[4 + k]) / 3); }
        else { pal[8 + k] = (pal[k] + pal[4 + k]) >> 1; pal[12 + k] = 0; }
      }
      const bits = (src[co + 4] | (src[co + 5] << 8) | (src[co + 6] << 16) | (src[co + 7] << 24)) >>> 0;
      if (kind === 3) {
        for (let i = 0; i < 16; i++) { const nib = (src[o + (i >> 1)] >> ((i & 1) * 4)) & 15; alpha[i] = nib * 17; }
      } else if (kind === 5) {
        const a0 = src[o], a1 = src[o + 1];
        const ap = [a0, a1, 0, 0, 0, 0, 0, 0];
        if (a0 > a1) for (let k = 1; k <= 6; k++) ap[1 + k] = Math.floor(((7 - k) * a0 + k * a1) / 7);
        else { for (let k = 1; k <= 4; k++) ap[1 + k] = Math.floor(((5 - k) * a0 + k * a1) / 5); ap[6] = 0; ap[7] = 255; }
        let lo = 0n;
        for (let k = 0; k < 6; k++) lo |= BigInt(src[o + 2 + k]) << BigInt(8 * k);
        for (let i = 0; i < 16; i++) alpha[i] = ap[Number((lo >> BigInt(3 * i)) & 7n)];
      }
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < 4; px++) {
          const x = bx * 4 + px, y = by * 4 + py;
          if (x >= w || y >= h) continue;
          const i = py * 4 + px;
          const sel = (bits >>> (2 * i)) & 3;
          const d = (y * w + x) * 4;
          dst[d] = pal[sel * 4]; dst[d + 1] = pal[sel * 4 + 1]; dst[d + 2] = pal[sel * 4 + 2];
          dst[d + 3] = kind === 1 ? (!opaque4 && sel === 3 ? 0 : 255) : alpha[i];
        }
      }
    }
  }
}
