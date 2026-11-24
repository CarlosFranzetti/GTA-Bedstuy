/**
 * Pins what a first real community car pack showed (MODS3): the layout is rebuilt here byte by byte from what was
 * measured, with made-up pixels and names. No third-party file is used.
 */
import { describe, it, expect } from 'vitest';
import { parseTxd } from '@/mods/rw/txd';
import { parseDff } from '@/mods/rw/dff';
import { buildDff as build } from '@/mods/convert';
import { LIMITS, ModError } from '@/mods/limits';
import { buildDff, cubeGeo, chunk, w, type TestFrame } from './rwWriters';

const HIGH = LIMITS.high;
const OLD = 0x0c02ffff; // library stamp of the 2002 file (3.1.0.0)

/** A texture native chunk as the old community tool wrote it: name fields hold stack leftovers after the NUL, and the chunk sizes are stale. */
function oldNative(name: string, width: number, height: number, opts: { junkAfterName?: boolean; staleSize?: number; mips?: number; dropTail?: number; noExt?: boolean } = {}): Uint8Array {
  const field = new Uint8Array(32);
  for (let i = 0; i < name.length; i++) field[i] = name.charCodeAt(i);
  if (opts.junkAfterName) field.set([0x94, 0xd8, 0x90, 0x00, 0x94, 0xd8, 0x90, 0x00, 0x41, 0x42, 0x43], name.length + 1);
  const s = w().u32(8).u32(0x1102).push(field).push(new Uint8Array(32));
  s.u32(0x2600).u32(0).u16(width).u16(height).u8(8).u8(opts.mips ?? 1).u8(4).u8(0);
  const pal = new Uint8Array(1024);
  for (let i = 0; i < 256; i++) pal.set([i, 255 - i, 7, 255], i * 4);
  s.push(pal);
  const px = new Uint8Array(width * height).map((_, i) => i & 255);
  s.u32(px.length).push(px);
  for (let m = 1; m < (opts.mips ?? 1); m++) { const n = Math.max(1, (width >> m) * (height >> m)); s.u32(n).push(new Uint8Array(n).fill(9)); }
  let body = s.done();
  if (opts.dropTail) body = body.slice(0, body.length - opts.dropTail);
  const st = chunk(1, OLD, body);
  if (opts.staleSize !== undefined) new DataView(st.buffer).setUint32(4, opts.staleSize, true); // the struct says it is small
  const parts = [st];
  if (!opts.noExt) parts.push(chunk(3, OLD, new Uint8Array(0)));
  const c = chunk(0x15, OLD, parts);
  if (opts.staleSize !== undefined) new DataView(c.buffer).setUint32(4, opts.staleSize + 24, true); // so does the chunk
  return c;
}
function oldDictionary(natives: Uint8Array[], extraOuter = 0): Uint8Array {
  const d = chunk(0x16, OLD, [chunk(1, OLD, w().u16(natives.length).u16(0).done()), ...natives]);
  new DataView(d.buffer).setUint32(4, d.length - 12 + extraOuter, true);
  return d;
}

describe('a texture dictionary written by an old community tool', () => {
  it('reads textures whose chunk sizes are stale and whose outer size runs past the end of the file', () => {
    const file = oldDictionary([
      oldNative('side', 32, 32, { staleSize: 5212 }),
      oldNative('grille', 64, 16, { staleSize: 5212, junkAfterName: true }),
    ], 24);
    const r = parseTxd(file, HIGH);
    expect(r.textures.map((t) => [t.name, t.width, t.height])).toEqual([['side', 32, 32], ['grille', 64, 16]]);
    expect(r.skipped).toEqual([]);
    // pixels came from the right place: index i uses palette entry i
    expect(Array.from(r.textures[0].rgba.slice(4 * 5, 4 * 5 + 4))).toEqual([5, 250, 7, 255]);
    expect(Array.from(r.textures[1].rgba.slice(0, 4))).toEqual([0, 255, 7, 255]);
  });

  it('takes the name up to the first NUL and ignores the leftovers after it', () => {
    const r = parseTxd(oldDictionary([oldNative('Crashed', 8, 8, { junkAfterName: true })]), HIGH);
    expect(r.textures[0].name).toBe('crashed');
  });

  it('steps over smaller mip levels by their own sizes so the next texture starts in the right place', () => {
    const r = parseTxd(oldDictionary([oldNative('a', 16, 16, { mips: 3, staleSize: 100 }), oldNative('b', 8, 8, { staleSize: 100 })]), HIGH);
    expect(r.textures.map((t) => t.name)).toEqual(['a', 'b']);
  });

  it('accepts a last texture that ends a few bytes early and says so', () => {
    const r = parseTxd(oldDictionary([oldNative('a', 8, 8), oldNative('last', 16, 16, { dropTail: 4, noExt: true })]), HIGH);
    expect(r.textures).toHaveLength(2);
    expect(r.warnings.join(' ')).toMatch(/last.*4 bytes/);
    expect(r.textures[1].rgba.length).toBe(16 * 16 * 4);
  });

  it('still refuses a texture that is cut far short, naming it', () => {
    const file = oldDictionary([oldNative('cut', 16, 16, { dropTail: 100, noExt: true })]);
    expect(() => parseTxd(file, HIGH)).toThrow(/"cut" is cut short/);
    try { parseTxd(file, HIGH); } catch (e) { expect(e).toBeInstanceOf(ModError); expect((e as ModError).code).toBe('truncated'); }
  });

  it('refuses a dictionary whose texture struct is missing', () => {
    const bad = oldDictionary([chunk(0x15, OLD, [chunk(3, OLD, new Uint8Array(0))])]);
    expect(() => parseTxd(bad, HIGH)).toThrow(ModError);
  });
});

describe('a car that carries its own wheel meshes and seat markers', () => {
  const frames: TestFrame[] = [
    { name: 'car' }, { name: 'wheel', parent: 0 }, { name: 'chassis_hi', parent: 0 }, { name: 'ped_rearseat', parent: 0 },
    { name: 'wheel_lf_dummy', pos: [-0.9, 1.3, 0.3], parent: 0 }, { name: 'wheel_rf_dummy', pos: [0.9, 1.3, 0.3], parent: 0 },
    { name: 'wheel_lb_dummy', pos: [-0.9, -1.3, 0.3], parent: 0 }, { name: 'wheel_rb_dummy', pos: [0.9, -1.3, 0.3], parent: 0 },
    { name: 'wheel_lf', parent: 4 }, { name: 'wheel_rf', parent: 5 }, { name: 'wheel_lb', parent: 6 }, { name: 'wheel_rb', parent: 7 },
    { name: 'bonnet_hi_dam', parent: 0 }, { name: 'chassis_vlo', parent: 0 },
  ];
  const wheelGeo = (): ReturnType<typeof cubeGeo> => cubeGeo(-0.12, -0.3, -0.3, 0.12, 0.3, 0.3, [{ color: [30, 30, 30, 255] }]);
  const file = buildDff({
    frames,
    geos: [cubeGeo(-1, -2, -2, 1, 2, 2, [{ color: [30, 30, 30, 255] }]) /* merged far wheels */, cubeGeo(-1, -2, 0.3, 1, 2, 1.3), cubeGeo(0.3, -1, 0.2, 0.4, -0.9, 0.3), wheelGeo(), wheelGeo(), wheelGeo(), wheelGeo(), cubeGeo(-1, 1, 0.3, 1, 2, 1.3), cubeGeo(-1, -2, 0.3, 1, 2, 1.3)],
    atomics: [[1, 0], [2, 1], [3, 2], [8, 3], [9, 4], [10, 5], [11, 6], [12, 7], [13, 8]],
  });

  it('draws each wheel once from its own mesh, drops the merged "wheel" copy, the seat marker, damaged and low-detail parts', () => {
    const b = build(parseDff(file, HIGH), new Map());
    const names = [...new Set(b.root.children.map((c) => c.name))].sort();
    expect(names).toEqual(['chassis_hi', 'wheel_f_l', 'wheel_f_r', 'wheel_r_l', 'wheel_r_r']);
    expect(b.triangles).toBe(12 + 4 * 12);
  });
});
