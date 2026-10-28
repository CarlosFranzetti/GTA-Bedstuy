import { describe, expect, it } from 'vitest';
import { PUDDLE_MASK_METRES, puddleMaskPainter } from '@/textures/painters/ground';
import { ALLOWED, render } from './softcanvas';

const W = 128;

function red(px: Uint8ClampedArray, x: number, y: number): number { return px[(y * W + x) * 4]; }

describe('puddle mask painter (wet ground variant)', () => {
  it('uses only the allowed canvas primitives and is deterministic', () => {
    const a = render(puddleMaskPainter, W, W, 5, 0);
    const b = render(puddleMaskPainter, W, W, 5, 0);
    for (const n of a.names) expect(ALLOWED.has(n)).toBe(true);
    expect(Array.from(a.px)).toEqual(Array.from(b.px));
  });

  it('has dry ground, damp rims and standing-water cores in sensible proportions', () => {
    const { px } = render(puddleMaskPainter, W, W, 5, 0);
    let core = 0, dry = 0;
    for (let i = 0; i < W * W; i++) { const r = px[i * 4]; if (r > 190) core++; if (r < 25) dry++; }
    expect(core / (W * W)).toBeGreaterThan(0.03);
    expect(core / (W * W)).toBeLessThan(0.4);
    expect(dry / (W * W)).toBeGreaterThan(0.2);
  });

  it('tiles seamlessly: the wrap seam is no rougher than the interior', () => {
    const { px } = render(puddleMaskPainter, W, W, 5, 0);
    let seamX = 0, seamY = 0, inner = 0;
    for (let i = 0; i < W; i++) {
      seamX += Math.abs(red(px, W - 1, i) - red(px, 0, i));
      seamY += Math.abs(red(px, i, W - 1) - red(px, i, 0));
    }
    for (let x = 0; x < W - 1; x++) for (let y = 0; y < W; y++) inner += Math.abs(red(px, x, y) - red(px, x + 1, y));
    inner /= (W - 1) * W;
    expect(seamX / W).toBeLessThan(inner * 3 + 4);
    expect(seamY / W).toBeLessThan(inner * 3 + 4);
  });

  it('variant 1 reseeds the layout and the repeat length is a sane number of metres', () => {
    const a = render(puddleMaskPainter, W, W, 5, 0).px;
    const b = render(puddleMaskPainter, W, W, 5, 1).px;
    expect(Array.from(a)).not.toEqual(Array.from(b));
    expect(PUDDLE_MASK_METRES).toBeGreaterThan(6);
  });
});
