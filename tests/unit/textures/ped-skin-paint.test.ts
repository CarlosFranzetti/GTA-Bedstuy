import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearPeople, dressLod, jointFor, parseShape, registerShape, shapeFor, topHemY, type MhShape } from '@/entities/models/pedMesh';
import { bodyTypeOf } from '@/entities/models/pedBodyTypes';
import { PED_SPECS } from '@/textures/painters/ped';
import { SK_RECTS, bakeSkin, type BakeInput } from '@/textures/painters/pedSkinPaint';

// A map is baked by 3D position from the real people shapes; the canvas is a stub that keeps the ImageData it is given.
type Fs = { readFileSync(p: URL): { buffer: ArrayBufferLike; byteOffset: number; byteLength: number }; readdirSync(p: URL): string[] };
const nodeFs = async (): Promise<Fs> => (await import(/* @vite-ignore */ 'node:' + 'fs')) as unknown as Fs;
const DIR = new URL('../../../src/assets/models/people/', import.meta.url);
const g = globalThis as unknown as Record<string, unknown>;
let last: { data: Uint8ClampedArray; w: number } | null = null;
const shapes: MhShape[] = [];

function bake(id: string, size = 256): Uint8ClampedArray {
  const v = PED_SPECS.findIndex((s) => s.id === id), spec = PED_SPECS[v], s = shapes.find((x) => x.name === shapeFor(spec))!;
  const L = dressLod(s, spec, s.lods.hi, true), bt = bodyTypeOf(spec), R: Record<string, number[]> = {};
  for (const [k, p] of Object.entries(s.rig)) R[k] = jointFor(k, p, bt);
  const input: BakeInput = { position: L.position, normal: L.normal, uv: L.uv, index: L.index, joints: L.joints, weights: L.weights, landmarks: s.landmarks, rig: R, headRings: s.headRings as number[][], topHem: topHemY(s, spec), spec };
  bakeSkin(input, size);
  return last!.data.slice();
}
const hash = (a: Uint8ClampedArray): number => { let h = 2166136261 >>> 0; for (let i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 16777619); } return h >>> 0; };

beforeAll(async () => {
  g.ImageData = class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} };
  g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ putImageData: (d: { data: Uint8ClampedArray; width: number }) => { last = { data: d.data, w: d.width }; } }) }) };
  clearPeople();
  const fs = await nodeFs();
  for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.glb')).sort()) {
    const b = fs.readFileSync(new URL(f, DIR));
    const s = await parseShape(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    shapes.push(s); registerShape(s);
  }
}, 60000);
afterAll(() => { delete g.document; delete g.ImageData; clearPeople(); });

const IDS = ['ba-hoodie-fade', 'hj-man', 'me-hijabi', 'ba-elder', 'la-site', 'ba-puffer-braids', 'ba-church-man', 'ea-nurse', 'wh-flannel', 'ba-sundress', 'ca-shorts', 'ba-transit'];

describe('people skin painter (pedSkinPaint + pedPaint*)', () => {
  it('is deterministic by person, opaque everywhere, and every person differs', () => {
    const seen = new Set<number>();
    for (const id of IDS) {
      const a = bake(id), b = bake(id);
      expect(hash(a), id).toBe(hash(b));
      for (let i = 3; i < a.length; i += 4) if (a[i] !== 255) throw new Error(`${id}: transparent texel at ${(i - 3) / 4}`);
      seen.add(hash(a));
    }
    expect(seen.size).toBe(IDS.length);
  }, 120000);

  it('paints each swatch inside its rectangle: changing the hat colour changes only the hat rectangle (hat on a person without a painted hat cap)', () => {
    const i = PED_SPECS.findIndex((s) => s.id === 'ba-transit'), orig = PED_SPECS[i].hatColor;
    const a = bake('ba-transit');
    PED_SPECS[i].hatColor = '#ff00ff';
    const b = bake('ba-transit');
    PED_SPECS[i].hatColor = orig;
    const k = 256 / 512, r = SK_RECTS.hat;
    let outside = 0, inside = 0;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const q = (y * 256 + x) * 4, d = Math.abs(a[q] - b[q]) + Math.abs(a[q + 1] - b[q + 1]) + Math.abs(a[q + 2] - b[q + 2]);
      const inRect = x >= r.x * k && x < (r.x + r.w) * k && y >= r.y * k && y < (r.y + r.h) * k;
      if (d > 0) { if (inRect) inside++; else outside++; }
    }
    expect(inside).toBeGreaterThan(100);
    expect(outside).toBe(0);
  }, 60000);

  it('keeps the neutral white texels of the bag swatch (the hair / accessory lane tints metal with them)', () => {
    const a = bake('la-site', 512), r = SK_RECTS.gear;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x + r.w - 16; x < r.x + r.w; x++) {
      const q = (y * 512 + x) * 4;
      expect([a[q], a[q + 1], a[q + 2]]).toEqual([255, 255, 255]);
    }
  }, 60000);

  it('paints the face: dark pupils and lighter eye whites exist on the front of the head, on a dark and a light skin', () => {
    for (const id of ['ba-hoodie-fade', 'wh-flannel']) {
      const a = bake(id, 512);
      let dark = 0, light = 0;
      for (let y = 90; y < 140; y++) for (let x = 40; x < 220; x++) { const q = (y * 512 + x) * 4, l = (a[q] + a[q + 1] + a[q + 2]) / 3; if (l < 45) dark++; if (l > 175 && l < 235) light++; }
      expect(dark, id).toBeGreaterThan(8);
      expect(light, id).toBeGreaterThan(8);
    }
  }, 60000);

  it('has no lettering: no person carries text and the painter sources use no text calls', async () => {
    for (const s of PED_SPECS) { expect((s.top as { printText?: string }).printText, s.id).toBeUndefined(); expect(s.hatLogo === '' || s.hatLogo === '*', s.id).toBe(true); }
    const fs = (await import(/* @vite-ignore */ 'node:' + 'fs')) as unknown as { readFileSync(p: URL, e: string): string };
    for (const f of ['pedSkinPaint', 'pedPaintShared', 'pedPaintFace', 'pedPaintCloth', 'pedPaintBody', 'pedPaintShade', 'pedPaintSwatch']) {
      const src = fs.readFileSync(new URL(`../../../src/textures/painters/${f}.ts`, import.meta.url), 'utf8');
      expect(/fillText|strokeText|font\s*=/.test(src), f).toBe(false);
    }
  });
});
