import { describe, expect, it } from 'vitest';
import { GROUND_VARIATION, VARIATION_SIZE, variationFactor, variationField } from '@/textures/groundVariation';

describe('ground variation field', () => {
  const a = variationField();
  it('is deterministic for a seed and differs between seeds', () => {
    expect(Array.from(variationField().slice(0, 4096))).toEqual(Array.from(a.slice(0, 4096)));
    expect(Array.from(variationField(VARIATION_SIZE, 'other').slice(0, 4096))).not.toEqual(Array.from(a.slice(0, 4096)));
  });

  it('is tileable: opposite edges are as close as neighbouring texels', () => {
    const n = VARIATION_SIZE;
    const px = (x: number, y: number, c: number): number => a[(y * n + x) * 4 + c];
    let seam = 0, inner = 0;
    for (let y = 0; y < n; y++) for (let c = 0; c < 3; c++) {
      seam += Math.abs(px(0, y, c) - px(n - 1, y, c));
      inner += Math.abs(px(n / 2, y, c) - px(n / 2 + 1, y, c));
    }
    expect(seam).toBeLessThan(inner * 2.5 + 200);
  });

  it('has real contrast (patches) with a centred mean in every channel', () => {
    for (let c = 0; c < 3; c++) {
      let sum = 0, min = 255, max = 0;
      for (let i = 0; i < VARIATION_SIZE * VARIATION_SIZE; i++) { const v = a[i * 4 + c]; sum += v; min = Math.min(min, v); max = Math.max(max, v); }
      const mean = sum / (VARIATION_SIZE * VARIATION_SIZE);
      expect(mean).toBeGreaterThan(100);
      expect(mean).toBeLessThan(156);
      expect(max - min).toBeGreaterThan(120);
    }
  });

  it('the albedo factor stays in a sane band (never crushes, never blows) for every strength and sample', () => {
    for (const s of Object.values(GROUND_VARIATION)) {
      for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
        const f = variationFactor([i / 10, j / 10, i / 10], [j / 10, i / 10, j / 10], s);
        for (const ch of f) { expect(ch).toBeGreaterThan(0.45); expect(ch).toBeLessThan(1.3); }
      }
      // grime pulls toward brown-grey: blue is lost faster than red
      const dirty = variationFactor([0.5, 1, 0.5], [0.5, 0.5, 0.5], s);
      expect(dirty[2]).toBeLessThan(dirty[0]);
    }
  });
});
