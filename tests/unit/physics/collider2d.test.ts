import { describe, it, expect } from 'vitest';
import { obbCorners, overlap, pointInPolygon, rayShape } from '@/physics/Collider2D';
import type { Body2D, Shape2D } from '@/world/types';

let n = 0;
function body(shape: Shape2D, x = 0, z = 0, heading = 0): Body2D {
  return { id: `b${n++}`, kind: 'vehicle', shape, pos: { x, z }, vel: { x: 0, z: 0 }, heading, mass: 100 };
}
const circle = (x: number, z: number, r: number) => body({ kind: 'circle', r }, x, z);
const obb = (x: number, z: number, halfW: number, halfL: number, heading = 0) =>
  body({ kind: 'obb', halfW, halfL }, x, z, heading);
/** square (0,0)-(4,4), clockwise viewed from above */
const SQUARE = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }];
const polygon = (pts = SQUARE) => body({ kind: 'polygon', points: pts });
const segment = (ax: number, az: number, bx: number, bz: number) =>
  body({ kind: 'segment', a: { x: ax, z: az }, b: { x: bx, z: bz } });

describe('obbCorners', () => {
  it('returns 4 corners at heading 0 (halfW across x, halfL along z)', () => {
    const c = obbCorners({ x: 10, z: 20 }, 0, { kind: 'obb', halfW: 1, halfL: 2 });
    expect(c).toHaveLength(4);
    const xs = c.map((p) => p.x).sort((a, b) => a - b);
    const zs = c.map((p) => p.z).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(9); expect(xs[3]).toBeCloseTo(11);
    expect(zs[0]).toBeCloseTo(18); expect(zs[3]).toBeCloseTo(22);
  });
  it('rotates with heading (east: length along x)', () => {
    const c = obbCorners({ x: 0, z: 0 }, Math.PI / 2, { kind: 'obb', halfW: 1, halfL: 2 });
    const xs = c.map((p) => p.x);
    const zs = c.map((p) => p.z);
    expect(Math.max(...xs)).toBeCloseTo(2); expect(Math.min(...xs)).toBeCloseTo(-2);
    expect(Math.max(...zs)).toBeCloseTo(1); expect(Math.min(...zs)).toBeCloseTo(-1);
  });
});

describe('overlap: circle-circle', () => {
  it('returns MTV from a toward b', () => {
    const m = overlap(circle(0, 0, 1), circle(1.5, 0, 1))!;
    expect(m).not.toBeNull();
    expect(m.normal.x).toBeCloseTo(1); expect(m.normal.z).toBeCloseTo(0);
    expect(m.depth).toBeCloseTo(0.5);
    expect(m.point.x).toBeGreaterThan(0.4); expect(m.point.x).toBeLessThan(1.1);
  });
  it('is null when separated or merely touching', () => {
    expect(overlap(circle(0, 0, 1), circle(3, 0, 1))).toBeNull();
    expect(overlap(circle(0, 0, 1), circle(2, 0, 1))).toBeNull();
  });
  it('handles coincident centres without NaN', () => {
    const m = overlap(circle(1, 1, 1), circle(1, 1, 1))!;
    expect(Number.isFinite(m.normal.x)).toBe(true);
    expect(Math.hypot(m.normal.x, m.normal.z)).toBeCloseTo(1);
    expect(m.depth).toBeCloseTo(2);
  });
  it('is symmetric: swapping flips the normal', () => {
    const m = overlap(circle(1.5, 0, 1), circle(0, 0, 1))!;
    expect(m.normal.x).toBeCloseTo(-1);
  });
});

describe('overlap: circle vs OBB rotated 45 degrees', () => {
  const diamond = () => obb(0, 0, 1, 1, Math.PI / 4); // vertices on the axes at distance sqrt(2)
  it('vertex contact', () => {
    const m = overlap(circle(1.6, 0, 0.5), diamond())!;
    expect(m).not.toBeNull();
    expect(m.depth).toBeCloseTo(0.5 - (1.6 - Math.SQRT2), 5);
    expect(m.normal.x).toBeCloseTo(-1, 5); expect(m.normal.z).toBeCloseTo(0, 5);
  });
  it('face contact, obb as a', () => {
    const m = overlap(diamond(), circle(0.9, 0.9, 0.5))!;
    expect(m.depth).toBeCloseTo(0.5 - (1.8 / Math.SQRT2 - 1), 5);
    expect(m.normal.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(m.normal.z).toBeCloseTo(Math.SQRT1_2, 5);
  });
  it('misses when apart', () => {
    expect(overlap(circle(2, 0, 0.5), diamond())).toBeNull();
  });
  it('circle centre inside the box is pushed out the nearest face', () => {
    const m = overlap(circle(0.8, 0, 0.3), obb(0, 0, 1, 2))!; // box 2 wide in x, 4 long in z
    expect(m.depth).toBeCloseTo(0.2 + 0.3, 5);
    expect(m.normal.x).toBeCloseTo(-1, 5);
  });
});

describe('overlap: OBB vs OBB', () => {
  it('separated returns null', () => {
    expect(overlap(obb(0, 0, 1, 2), obb(2.5, 0, 1, 2))).toBeNull();
  });
  it('overlapping axis-aligned boxes', () => {
    const m = overlap(obb(0, 0, 1, 2), obb(1.5, 0, 1, 2))!;
    expect(m.depth).toBeCloseTo(0.5);
    expect(m.normal.x).toBeCloseTo(1); expect(m.normal.z).toBeCloseTo(0);
  });
  it('overlapping perpendicular boxes', () => {
    const m = overlap(obb(0, 0, 1, 2, 0), obb(0, 2.8, 1, 2, Math.PI / 2))!;
    expect(m.depth).toBeCloseTo(0.2);
    expect(m.normal.z).toBeCloseTo(1);
  });
  it('rotated boxes that only look overlapping by AABB are separated by SAT', () => {
    // diamond (|x|+|z| <= 1.414) and a square at (1.6,1.6): AABBs overlap, shapes do not
    expect(overlap(obb(0, 0, 1, 1, Math.PI / 4), obb(1.6, 1.6, 0.5, 0.5, 0))).toBeNull();
  });
  it('one box inside another uses the shortest escape', () => {
    const m = overlap(obb(0, 0, 3, 3), obb(1, 0, 0.5, 0.5))!;
    expect(m.normal.x).toBeCloseTo(1);
    expect(m.depth).toBeCloseTo(3 - (1 - 0.5));
  });
});

describe('overlap: circle vs polygon', () => {
  it('edge', () => {
    const m = overlap(circle(4.3, 2, 0.5), polygon())!;
    expect(m.depth).toBeCloseTo(0.2, 5);
    expect(m.normal.x).toBeCloseTo(-1, 5); expect(m.normal.z).toBeCloseTo(0, 5);
  });
  it('corner', () => {
    const m = overlap(circle(4.3, 4.3, 0.5), polygon())!;
    const d = Math.hypot(0.3, 0.3);
    expect(m.depth).toBeCloseTo(0.5 - d, 5);
    expect(m.normal.x).toBeCloseTo(-Math.SQRT1_2, 5);
    expect(m.normal.z).toBeCloseTo(-Math.SQRT1_2, 5);
    expect(m.point.x).toBeCloseTo(4, 5); expect(m.point.z).toBeCloseTo(4, 5);
  });
  it('near the corner but outside the radius is null (no false edge hit)', () => {
    expect(overlap(circle(4.4, 4.4, 0.5), polygon())).toBeNull();
  });
  it('polygon as a: normal flips to point from polygon toward circle', () => {
    const m = overlap(polygon(), circle(4.3, 2, 0.5))!;
    expect(m.normal.x).toBeCloseTo(1, 5);
  });
  it('centre inside the polygon is pushed out the nearest edge', () => {
    const m = overlap(circle(3.5, 2, 0.5), polygon())!;
    expect(m.depth).toBeCloseTo(1.0, 5);
    expect(m.normal.x).toBeCloseTo(-1, 5); // circle->polygon: opposite of the push-out direction (+x)
  });
  it('works with counter-clockwise winding too', () => {
    const ccw = [...SQUARE].reverse();
    const m = overlap(circle(4.3, 2, 0.5), polygon(ccw))!;
    expect(m.depth).toBeCloseTo(0.2, 5);
    expect(m.normal.x).toBeCloseTo(-1, 5);
  });
});

describe('overlap: OBB vs polygon', () => {
  it('car against a building footprint', () => {
    const m = overlap(obb(5, 2, 0.9, 2.3, Math.PI / 2), polygon())!; // heading east, length along x: spans x 2.7..7.3
    expect(m.depth).toBeCloseTo(1.3, 5);
    expect(m.normal.x).toBeCloseTo(-1, 5);
  });
  it('apart is null', () => {
    expect(overlap(obb(9, 2, 0.9, 2.3), polygon())).toBeNull();
  });
});

describe('overlap: segment', () => {
  it('segment vs circle behaves as a thin capsule', () => {
    const m = overlap(circle(0.3, 0, 0.4), segment(0, -5, 0, 5))!;
    expect(m.depth).toBeCloseTo(0.4 + 0.025 - 0.3, 5);
    expect(m.normal.x).toBeCloseTo(-1, 5);
  });
  it('circle past the segment end is null / vertex-correct', () => {
    expect(overlap(circle(0, 5.6, 0.4), segment(0, -5, 0, 5))).toBeNull();
    const m = overlap(circle(0, 5.3, 0.4), segment(0, -5, 0, 5))!;
    expect(m.normal.z).toBeCloseTo(-1, 5);
  });
  it('segment vs obb', () => {
    const m = overlap(obb(0.5, 0, 1, 2), segment(0, -5, 0, 5))!;
    // box spans x -0.5..1.5; the thin wall sits at x=0, so the shortest way out is toward -x
    expect(m.depth).toBeCloseTo(0.5 + 0.025, 4);
    expect(m.normal.x).toBeCloseTo(-1, 5); // from a (box) toward b (wall)
  });
  it('segment as a, circle as b flips normal', () => {
    const m = overlap(segment(0, -5, 0, 5), circle(0.3, 0, 0.4))!;
    expect(m.normal.x).toBeCloseTo(1, 5);
  });
});

describe('pointInPolygon', () => {
  it('inside / outside / either winding', () => {
    expect(pointInPolygon({ x: 2, z: 2 }, SQUARE)).toBe(true);
    expect(pointInPolygon({ x: 5, z: 2 }, SQUARE)).toBe(false);
    expect(pointInPolygon({ x: 2, z: 2 }, [...SQUARE].reverse())).toBe(true);
    expect(pointInPolygon({ x: -0.1, z: 2 }, SQUARE)).toBe(false);
  });
});

describe('rayShape', () => {
  const dirE = { x: 1, z: 0 };
  it('hits a polygon at the right distance', () => {
    const h = rayShape({ x: -3, z: 2 }, dirE, 20, polygon())!;
    expect(h.dist).toBeCloseTo(3);
    expect(h.point.x).toBeCloseTo(0); expect(h.point.z).toBeCloseTo(2);
  });
  it('misses when pointing away or short', () => {
    expect(rayShape({ x: -3, z: 2 }, { x: -1, z: 0 }, 20, polygon())).toBeNull();
    expect(rayShape({ x: -3, z: 2 }, dirE, 2, polygon())).toBeNull();
    expect(rayShape({ x: -3, z: 5 }, dirE, 20, polygon())).toBeNull();
  });
  it('hits circles', () => {
    const h = rayShape({ x: -5, z: 0 }, dirE, 20, circle(0, 0, 1))!;
    expect(h.dist).toBeCloseTo(4);
  });
  it('hits an obb (rotated) and a segment', () => {
    const h = rayShape({ x: -5, z: 0 }, dirE, 20, obb(0, 0, 1, 2, Math.PI / 2))!;
    expect(h.dist).toBeCloseTo(3);
    const s = rayShape({ x: -5, z: 0 }, dirE, 20, segment(1, -3, 1, 3))!;
    expect(s.dist).toBeGreaterThan(5.9); expect(s.dist).toBeLessThan(6.0);
  });
  it('normalises the direction', () => {
    const h = rayShape({ x: -3, z: 2 }, { x: 5, z: 0 }, 20, polygon())!;
    expect(h.dist).toBeCloseTo(3);
  });
  it('origin inside returns dist 0', () => {
    expect(rayShape({ x: 2, z: 2 }, dirE, 10, polygon())!.dist).toBe(0);
  });
});
