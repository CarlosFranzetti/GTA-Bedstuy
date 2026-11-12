import { afterEach, describe, expect, it } from 'vitest';
import { easeGround, groundAt, ringGround, setGround, slabGround } from '@/world/Ground';

// Characters were drawn at road height everywhere, so on a sidewalk (a slab 0.15 m tall) their shoes and ankles were inside the slab.
describe('walking-surface height', () => {
  afterEach(() => setGround(null));
  const square = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 }];

  it('is road height until a map registers its surface', () => {
    expect(groundAt(5, 5)).toBe(0);
  });
  it('grid map: on a block slab the surface is the slab top, on the roadway it is zero', () => {
    setGround(slabGround([square, square.map((p) => ({ x: p.x + 30, z: p.z }))], 0.15));
    expect(groundAt(5, 5)).toBe(0.15);
    expect(groundAt(35, 9.9)).toBe(0.15);
    expect(groundAt(20, 5)).toBe(0);
    expect(groundAt(5, -1)).toBe(0);
  });
  it('real map: inside a curb ring unless the point is on a roadway', () => {
    const tri = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 0, z: 20 }];
    setGround(ringGround([tri, []], (p) => p.x < 2, 0.15));
    expect(groundAt(5, 5)).toBe(0.15);
    expect(groundAt(1, 5)).toBe(0);    // the ring covers it but it is roadway
    expect(groundAt(15, 15)).toBe(0);  // inside the bounding box, outside the triangle
  });
  it('a kerb is stepped, not popped: the drawn height eases, a first placement snaps', () => {
    expect(easeGround(NaN, 0.15, 1 / 60)).toBe(0.15);
    const y1 = easeGround(0, 0.15, 1 / 60);
    expect(y1).toBeGreaterThan(0.02);
    expect(y1).toBeLessThan(0.08);
    let y = 0;
    for (let i = 0; i < 40; i++) y = easeGround(y, 0.15, 1 / 60);
    expect(y).toBe(0.15);
  });
});
