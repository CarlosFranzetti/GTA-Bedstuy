import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlobShadows } from '@/render/BlobShadows';

const lot = (x: number, z: number) => ({ frontA: { x, z }, frontB: { x: x + 6, z }, depth: 20, outward: { x: 0, z: 1 }, type: 'brownstone' });
const cells = (b: BlobShadows) => (b.casterGroup.children.find((c) => c.name === 'caster:buildings') as unknown as { children: unknown[] }).children.length;

describe('phone sun-shadow building casters', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('few lots (the grid map) stay one mesh: three shadow draws', () => {
    vi.stubGlobal('location', { search: '?q=phone' });
    const b = new BlobShadows();
    b.buildSunCasters(Array.from({ length: 300 }, (_, i) => lot((i % 20) * 8, Math.floor(i / 20) * 30)));
    expect(cells(b)).toBe(1);
  });

  it('thousands of lots (the real-street map) are cut into cells, so a shadow pass draws only the cells in the sun box', () => {
    vi.stubGlobal('location', { search: '?q=phone' });
    const b = new BlobShadows();
    const lots = Array.from({ length: 7000 }, (_, i) => lot((i % 100) * 8, Math.floor(i / 100) * 30)); // 800 m x 2.1 km
    const built = b.buildSunCasters(lots);
    expect(built.triangles).toBeGreaterThan(60_000);
    expect(cells(b)).toBeGreaterThan(8);
  });
});
