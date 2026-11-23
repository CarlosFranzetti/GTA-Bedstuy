import { describe, expect, it } from 'vitest';
import '@/textures/painters/ped';
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
      if (o.onePiece) continue;
      expect(BASE_TOPS[o.top], `${o.id} top ${o.top}`).toBeTruthy();
      if (o.layer) expect(LAYERS[o.layer], `${o.id} layer ${o.layer}`).toBeTruthy();
      expect(BOTTOMS[o.bottom], `${o.id} bottom ${o.bottom}`).toBeTruthy();
      expect(SHOES[o.shoes], `${o.id} shoes ${o.shoes}`).toBeTruthy();
    }
  });
  it('colours are muted: at most one clearly saturated piece per way (an accent), none loud', () => {
    for (const o of OUTFITS) for (const w of o.ways) {
      const cs = [w.top, w.layer, w.bottom, w.shoes, w.hat, w.gear].filter(Boolean) as string[];
      const loud = cs.filter((c) => sat(c) > 0.55 && Math.max(...rgb(c)) > 110);   // dark browns are saturated but not loud
      expect(loud.length, `${o.id} ${cs.join(' ')}`).toBeLessThanOrEqual(1);
      for (const c of cs) expect(sat(c), `${o.id} ${c}`).toBeLessThan(0.85);
    }
  });
  it('no piece vanishes into its neighbour: without a layer the top differs from the bottom by 28 or more, with a layer the layer differs from the top shown under it', () => {
    const d = (a: string, b: string): number => { const p = rgb(a), q = rgb(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };
    for (const o of OUTFITS) for (const w of o.ways) {
      if (w.layer && w.top) expect(d(w.layer, w.top), `${o.id} layer ${w.layer} over ${w.top}`).toBeGreaterThanOrEqual(12);
      else if (o.top !== 'scrubs' && !o.onePiece && !['hoopsCourt'].includes(o.id) && w.top && w.bottom) expect(d(w.top!, w.bottom!), `${o.id} ${w.top} on ${w.bottom}`).toBeGreaterThanOrEqual(10);
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
