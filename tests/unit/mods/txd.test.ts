import { describe, it, expect } from 'vitest';
import { parseTxd } from '@/mods/rw/txd';
import { LIMITS, ModError } from '@/mods/limits';
import { buildTxd, c565 } from './rwWriters';

const HIGH = LIMITS.high;

describe('parseTxd', () => {
  it('reads a 4x4 8-bit palettised texture (palette is RGBA)', () => {
    const palette = new Uint8Array(1024);
    palette.set([255, 0, 0, 255], 0); palette.set([0, 255, 0, 128], 4); palette.set([0, 0, 255, 255], 8);
    const pixels = new Uint8Array(16).map((_, i) => i % 3);
    const r = parseTxd(buildTxd([{ name: 'Road_Pal', width: 4, height: 4, kind: 'pal8', pixels, palette }]), HIGH);
    expect(r.textures).toHaveLength(1);
    const t = r.textures[0];
    expect(t.name).toBe('road_pal');
    expect([t.width, t.height]).toEqual([4, 4]);
    expect(Array.from(t.rgba.slice(0, 8))).toEqual([255, 0, 0, 255, 0, 255, 0, 128]);
    expect(Array.from(t.rgba.slice(8, 12))).toEqual([0, 0, 255, 255]);
    expect(t.hasAlpha).toBe(true);
    expect(t.encoding).toBe('palette 8-bit');
  });

  it('reads a 4x4 32-bit texture stored B G R A', () => {
    const px = new Uint8Array(64);
    for (let i = 0; i < 16; i++) px.set([10 + i, 20 + i, 30 + i, 255], i * 4); // B, G, R, A
    const t = parseTxd(buildTxd([{ name: 'bgra', width: 4, height: 4, kind: 'bgra', pixels: px }]), HIGH).textures[0];
    expect(Array.from(t.rgba.slice(0, 4))).toEqual([30, 20, 10, 255]);
    expect(Array.from(t.rgba.slice(60, 64))).toEqual([45, 35, 25, 255]);
  });

  it('reads 16-bit 565', () => {
    const px = new Uint8Array(32);
    const dv = new DataView(px.buffer);
    for (let i = 0; i < 16; i++) dv.setUint16(i * 2, c565(255, 0, 0), true);
    const t = parseTxd(buildTxd([{ name: 'red', width: 4, height: 4, kind: '565', pixels: px }]), HIGH).textures[0];
    expect(Array.from(t.rgba.slice(0, 4))).toEqual([255, 0, 0, 255]);
  });

  for (const platform of [8, 9] as const) {
    it(`reads an 8x8 DXT1 texture with one extra mip level (platform ${platform})`, () => {
      // four blocks: red-ish, green-ish, blue-ish, white, each a solid block (all indices 0)
      const block = (c: number): number[] => [c & 255, c >> 8, c & 255, c >> 8, 0, 0, 0, 0];
      const px = Uint8Array.from([...block(c565(255, 0, 0)), ...block(c565(0, 255, 0)), ...block(c565(0, 0, 255)), ...block(c565(255, 255, 255))]);
      const mip = Uint8Array.from(block(c565(128, 128, 128)));
      const t = parseTxd(buildTxd([{ name: 'dxt', width: 8, height: 8, kind: 'dxt1', platform, pixels: px, extraMips: [mip] }]), HIGH).textures[0];
      expect(t.encoding).toBe('DXT1');
      const at = (x: number, y: number): number[] => Array.from(t.rgba.slice((y * 8 + x) * 4, (y * 8 + x) * 4 + 4));
      expect(at(0, 0)).toEqual([255, 0, 0, 255]);
      expect(at(5, 1)).toEqual([0, 255, 0, 255]);
      expect(at(2, 6)).toEqual([0, 0, 255, 255]);
      expect(at(7, 7)).toEqual([255, 255, 255, 255]);
    });
  }

  it('reads DXT3 explicit alpha', () => {
    const blk = Uint8Array.from([0xf0, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, ...[0xf8, 0xff, 0xf8, 0xff, 0, 0, 0, 0]]);
    const t = parseTxd(buildTxd([{ name: 'a', width: 4, height: 4, kind: 'dxt3', pixels: blk }]), HIGH).textures[0];
    expect(t.rgba[3]).toBe(0);      // first nibble 0
    expect(t.rgba[7]).toBe(0xff);   // second nibble 0xf
    expect(t.hasAlpha).toBe(true);
  });

  it('skips platforms it cannot read and keeps the others', () => {
    const palette = new Uint8Array(1024);
    const good = { name: 'ok', width: 4, height: 4, kind: 'pal8', pixels: new Uint8Array(16), palette };
    const bad = { ...good, name: 'ps2', platform: 6 as unknown as 8 };
    const r = parseTxd(buildTxd([bad, good]), HIGH);
    expect(r.textures.map((t) => t.name)).toEqual(['ok']);
    expect(r.skipped[0]).toMatch(/ps2/);
  });

  it('refuses oversize dimensions and files, and anything that is not a dictionary', () => {
    const big = { name: 'big', width: 4096, height: 4096, kind: 'bgra', pixels: new Uint8Array(16) };
    expect(() => parseTxd(buildTxd([big]), HIGH)).toThrow(/4096 x 4096/);
    expect(() => parseTxd(buildTxd([{ ...big, width: 1024, height: 1024 }]), LIMITS.phone)).toThrow(/allows up to 512/);
    expect(() => parseTxd(new Uint8Array(100), HIGH)).toThrow(ModError);
    expect(() => parseTxd(buildTxd([{ ...big, width: 4, height: 4 }]), { ...HIGH, maxTextureFileBytes: 20 })).toThrow(/too large/);
  });

  it('never throws anything but ModError on truncated or damaged files', () => {
    const good = buildTxd([{ name: 't', width: 4, height: 4, kind: 'pal8', pixels: new Uint8Array(16), palette: new Uint8Array(1024) }]);
    for (let cut = 0; cut < good.length; cut += 5) { try { parseTxd(good.subarray(0, cut), HIGH); } catch (e) { expect(e).toBeInstanceOf(ModError); } }
    let seed = 99;
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
    for (let n = 0; n < 300; n++) {
      const bad = good.slice();
      for (let k = 0; k < 5; k++) bad[rnd() % bad.length] = rnd() & 255;
      try { parseTxd(bad, HIGH); } catch (e) { expect(e).toBeInstanceOf(ModError); }
    }
  });
});
