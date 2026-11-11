import { describe, expect, it } from 'vitest';
import { Rng } from '@/core/Rng';
import {
  CIVILIAN_COUNT, PED_ATLAS, PED_SPECS, PED_VARIANT_COUNT, pedAtlasPainter, pedChurchBoost, pedTileRect, pedVariantIndex, mixHex,
} from '@/textures/painters/ped';
import { ALLOWED, render } from './softcanvas';

const atlas = (variant: number, seed = 1) => render(pedAtlasPainter, PED_ATLAS, PED_ATLAS, seed, variant);
const hash = (px: Uint8ClampedArray): number => { let h = 2166136261 >>> 0; for (let i = 0; i < px.length; i++) { h ^= px[i]; h = Math.imul(h, 16777619); } return h >>> 0; };
const at = (px: Uint8ClampedArray, x: number, y: number): [number, number, number] => { const i = (y * PED_ATLAS + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };

describe('ped atlas painter', () => {
  it('has at least 12 civilian variants plus a cop, Ms. Odette, the DJ and the player, with unique ids', () => {
    expect(CIVILIAN_COUNT).toBeGreaterThanOrEqual(12);
    expect(PED_VARIANT_COUNT).toBe(CIVILIAN_COUNT + 3 + 24) // cop, Ms. Odette, the DJ, and the player's 24 random looks;
    expect(new Set(PED_SPECS.map((s) => s.id)).size).toBe(PED_VARIANT_COUNT);
    for (const id of ['cop', 'odette', 'dj', 'player']) expect(PED_SPECS[pedVariantIndex(id)].role).not.toBe('civilian');
    expect(PED_SPECS[pedVariantIndex('odette')].role).toBe('shopkeeper');
    // the street crowd is mixed: ages, builds, hats, skin tones
    const civ = PED_SPECS.slice(0, CIVILIAN_COUNT);
    expect(new Set(civ.map((s) => s.skin)).size).toBeGreaterThanOrEqual(10);
    expect(civ.some((s) => s.build === 'kid' && s.gear === 'backpack')).toBe(true);
    expect(civ.some((s) => s.sunday)).toBe(true);
    expect(civ.some((s) => s.hat === 'headwrap')).toBe(true);
    expect(civ.some((s) => s.top.kind === 'vest')).toBe(true);
    expect(civ.some((s) => s.top.kind === 'puffer')).toBe(true);
    expect(civ.some((s) => s.top.kind === 'hoodie' && s.hat === 'cap')).toBe(true);
  });

  it('is deterministic per variant and seed, and every variant looks different', () => {
    const hashes = new Set<number>();
    for (let v = 0; v < PED_VARIANT_COUNT; v++) {
      const a = atlas(v), b = atlas(v);
      expect(hash(a.px)).toBe(hash(b.px));
      hashes.add(hash(a.px));
    }
    expect(hashes.size).toBe(PED_VARIANT_COUNT);
  });

  it('uses only basic 2D calls', () => {
    const r = atlas(0);
    for (const n of r.names) expect(ALLOWED.has(n)).toBe(true);
  });

  it('paints a readable face: white eyes with dark pupils, a mouth, skin around them', () => {
    const f = pedTileRect('headFront');
    for (let v = 0; v < CIVILIAN_COUNT; v++) {
      const { px } = atlas(v);
      const bright = (c: [number, number, number]) => c[0] > 215 && c[1] > 210 && c[2] > 195;
      const darkPx = (c: [number, number, number]) => c[0] < 60 && c[1] < 50 && c[2] < 50;
      let whites = 0, darks = 0;
      for (let y = f.y + 24; y < f.y + 36; y++) for (let x = f.x + 10; x < f.x + 54; x++) { const c = at(px, x, y); if (bright(c)) whites++; if (darkPx(c)) darks++; }
      expect(whites).toBeGreaterThan(8);
      expect(darks).toBeGreaterThan(6);
      // skin colour fills the cheek
      const cheek = at(px, f.x + 14, f.y + 40);
      expect(Math.abs(cheek[0] - hexR(PED_SPECS[v].skin))).toBeLessThan(70);
    }
  });

  it('has no lettering: the jersey carries contrast trim and no numerals', () => {
    for (const s of PED_SPECS) { expect((s.top as { printText?: string }).printText, s.id).toBeUndefined(); expect(s.hatLogo === '' || s.hatLogo === '*', s.id).toBe(true); }
    const t = pedTileRect('torsoFront');
    const { px } = atlas(pedVariantIndex('ba-jersey-teen'));
    let trim = 0;
    for (let y = t.y + 58; y < t.y + 63; y++) for (let x = t.x + 4; x < t.x + 60; x++) { const c = at(px, x, y); if (c[0] > 200 && c[1] > 200 && c[2] > 200) trim++; }
    expect(trim).toBeGreaterThan(30);
  });

  it('mixHex and the church boost behave', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(pedChurchBoost(11, true)).toBeGreaterThan(1);
    expect(pedChurchBoost(20, true)).toBe(1);
    expect(pedChurchBoost(11, false)).toBe(1);
  });

  it('is rng-seeded only for grain: a different seed keeps the colour blocks', () => {
    const a = atlas(0, 1), b = atlas(0, 2);
    expect(hash(a.px)).not.toBe(hash(b.px));
    const f = pedTileRect('torsoFront');
    expect(at(a.px, f.x + 4, f.y + 30)[0]).toBeCloseTo(at(b.px, f.x + 4, f.y + 30)[0], -1);
  });
});

function hexR(c: string): number { return parseInt(c.slice(1, 3), 16); }
void Rng;
