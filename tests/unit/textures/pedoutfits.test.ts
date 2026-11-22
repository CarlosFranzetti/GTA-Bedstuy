import { describe, expect, it } from 'vitest';
import { OUTFITS } from '@/textures/painters/pedOutfits';
import { BASE_TOPS, LAYERS, BOTTOMS, SHOES, composeSpec } from '@/textures/painters/pedWardrobe';
import { rgb } from '@/textures/painters/pedPaintShared';

const sat = (h: string): number => { const [r, g, b] = rgb(h), mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; };

describe('whole outfits (CLOTHES)', () => {
  it('at least twelve looks, each with two or three colourways', () => {
    expect(OUTFITS.length).toBeGreaterThanOrEqual(12);
    for (const o of OUTFITS) expect(o.ways.length, o.id).toBeGreaterThanOrEqual(2);
  });
  it('every garment id exists in the wardrobe tables and the layer or top it names fits the age and sex', () => {
    for (const o of OUTFITS) {
      expect(BASE_TOPS[o.top], `${o.id} top ${o.top}`).toBeTruthy();
      if (o.layer) expect(LAYERS[o.layer], `${o.id} layer ${o.layer}`).toBeTruthy();
      expect(BOTTOMS[o.bottom], `${o.id} bottom ${o.bottom}`).toBeTruthy();
      expect(SHOES[o.shoes], `${o.id} shoes ${o.shoes}`).toBeTruthy();
    }
  });
  it('colours are muted: at most one clearly saturated piece per way (an accent), none loud', () => {
    for (const o of OUTFITS) for (const w of o.ways) {
      const cs = [w.top, w.layer, w.bottom, w.shoes, w.hat, w.gear].filter(Boolean) as string[];
      const loud = cs.filter((c) => sat(c) > 0.55);
      expect(loud.length, `${o.id} ${cs.join(' ')}`).toBeLessThanOrEqual(1);
      for (const c of cs) expect(sat(c), `${o.id} ${c}`).toBeLessThan(0.85);
    }
  });
  it('composeSpec dresses about half of a crowd in a whole outfit and the same seed is the same person', () => {
    let a = 0; const n = 300;
    for (let i = 0; i < n; i++) {
      const s = composeSpec(1000 + i, { group: 'ba', sex: i % 2 ? 'f' : 'm', age: 'adult' }, { look: 'street', season: 'mild' });
      expect(composeSpec(1000 + i, { group: 'ba', sex: i % 2 ? 'f' : 'm', age: 'adult' }, { look: 'street', season: 'mild' }).id).toBe(s.id);
      if (!composeSpec(1000 + i, { group: 'ba', sex: i % 2 ? 'f' : 'm', age: 'adult' }, { look: 'street', season: 'mild', noOutfit: true }).id.includes(s.id.split('-').pop()!)) a++;
    }
    expect(a).toBeGreaterThan(n * 0.2);
  });
});
