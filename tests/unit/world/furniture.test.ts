import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildFurniture, setLampsLit } from '@/world/FurnitureGen';
import { Rng } from '@/core/Rng';
import type {
  Block, BlockFace, Circle, GridModel, IMaterialLibrary, Lot, PoiDef, Side, StaticCollider, StreetDef,
} from '@/world/types';
import type { Vec2 } from '@/core/Math2';

// ---------------------------------------------------------------- fake one-block grid
// Block r0c0 spans x 0..60, z 0..100 (north = -z). Sidewalk strip 3 m wide.
// Corners in curb order: NW (0,0), NE (60,0), SE (60,100), SW (0,100).

const SIDEWALK = 3;
const v = (x: number, z: number): Vec2 => ({ x, z });

const streets: StreetDef[] = [
  { id: 'hart', name: 'Hart St', signName: 'Hart St', axis: 'ns', offset: -20, class: 'street', roadWidth: 12, sidewalkWidth: SIDEWALK, oneWay: 0 },
  { id: 'throop', name: 'Throop Ave', signName: 'Throop Av', axis: 'ns', offset: 80, class: 'avenue', roadWidth: 14, sidewalkWidth: SIDEWALK, oneWay: 0 },
  { id: 'kos', name: 'Kosciuszko St', signName: 'Kosciusko St', axis: 'ew', offset: -10, class: 'street', roadWidth: 12, sidewalkWidth: SIDEWALK, oneWay: 0 },
  { id: 'lewis', name: 'Lewis Ave', signName: 'Lewis Av', axis: 'ew', offset: 110, class: 'avenue', roadWidth: 14, sidewalkWidth: SIDEWALK, oneWay: 0 },
];

// a->b runs left->right when standing on the street facing the block.
const faces: BlockFace[] = [
  { blockId: 'r0c0', side: 'N', streetId: 'kos', a: v(57, 3), b: v(3, 3), curbA: v(60, 0), curbB: v(0, 0), outward: v(0, -1) },
  { blockId: 'r0c0', side: 'E', streetId: 'throop', a: v(57, 97), b: v(57, 3), curbA: v(60, 100), curbB: v(60, 0), outward: v(1, 0) },
  { blockId: 'r0c0', side: 'S', streetId: 'lewis', a: v(3, 97), b: v(57, 97), curbA: v(0, 100), curbB: v(60, 100), outward: v(0, 1) },
  { blockId: 'r0c0', side: 'W', streetId: 'hart', a: v(3, 3), b: v(3, 97), curbA: v(0, 0), curbB: v(0, 100), outward: v(-1, 0) },
];

const curb: Vec2[] = [v(0, 0), v(60, 0), v(60, 100), v(0, 100)];
const block: Block = {
  id: 'r0c0', row: 0, col: 0, curb,
  buildingLine: [v(3, 3), v(57, 3), v(57, 97), v(3, 97)],
  faces,
};

const bodegaPoi: PoiDef = {
  id: 'p-deli', block: 'r0c0', face: 'N', t: 0.3, archetype: 'bodega', sign: 'Corner Deli', awningColor: '#d62828',
};

function mkLot(id: string, side: Side, fa: Vec2, fb: Vec2, type: Lot['type'], poi?: PoiDef): Lot {
  const face = faces.find((f) => f.side === side)!;
  return {
    id, blockId: 'r0c0', side, frontA: fa, frontB: fb,
    width: Math.hypot(fb.x - fa.x, fb.z - fa.z), depth: 14, outward: face.outward,
    type, corner: false, poi,
  };
}

// N face: bodega at x 39..51, a second mixed-use at x 21..33; S face: mixed-use at x 3..15.
const LOTS: Lot[] = [
  mkLot('n1', 'N', v(57, 3), v(51, 3), 'brownstone'),
  mkLot('n-bodega', 'N', v(51, 3), v(39, 3), 'mixeduse', bodegaPoi),
  mkLot('n2', 'N', v(39, 3), v(33, 3), 'brownstone'),
  mkLot('n-mixed', 'N', v(33, 3), v(21, 3), 'mixeduse'),
  mkLot('n3', 'N', v(21, 3), v(3, 3), 'brownstone'),
  mkLot('s-mixed', 'S', v(3, 97), v(15, 97), 'mixeduse'),
  mkLot('s1', 'S', v(15, 97), v(57, 97), 'brownstone'),
  mkLot('e1', 'E', v(57, 97), v(57, 3), 'brownstone'),
  mkLot('w1', 'W', v(3, 3), v(3, 97), 'rowhouse'),
];

const grid = {
  seed: 1,
  bounds: { minX: -100, maxX: 200, minZ: -100, maxZ: 200 },
  streets,
  intersections: [],
  segments: [],
  crosswalks: [],
  blocks: [block],
  streetById: (id: string): StreetDef => {
    const s = streets.find((x) => x.id === id);
    if (!s) throw new Error(`no street ${id}`);
    return s;
  },
} as unknown as GridModel;

// ---------------------------------------------------------------- stub materials

function fakeMaterials() {
  const cache = new Map<string, THREE.Material>();
  const requested: string[] = [];
  const signCalls: [string, string | undefined, string | undefined][] = [];
  const named = (name: string): THREE.Material => {
    let m = cache.get(name);
    if (!m) { m = new THREE.MeshBasicMaterial({ name }); cache.set(name, m); }
    return m;
  };
  const lib: IMaterialLibrary = {
    get: (key) => { requested.push(key); return named(key); },
    awning: (color, text) => named(`awning:${color}:${text}`),
    sign: (text, bg, fg) => { signCalls.push([text, bg, fg]); return named(text); },
    carPaint: (color) => named(`car:${color}`),
    setNight: () => {},
  };
  return { lib, requested, signCalls };
}

function build(seed = 42, lots: Lot[] = LOTS) {
  const mats = fakeMaterials();
  const out = buildFurniture(grid, lots, mats.lib, new Rng(seed));
  return { ...out, ...mats };
}

// ---------------------------------------------------------------- helpers

function circleOf(c: StaticCollider): Circle {
  return c.shape as Circle;
}

function inside(p: Vec2, poly: Vec2[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) hit = !hit;
  }
  return hit;
}

/** Along-face distance from curbA, and inward distance from the curb line, for a face. */
function frame(face: BlockFace) {
  const L = Math.hypot(face.curbB.x - face.curbA.x, face.curbB.z - face.curbA.z);
  const u = { x: (face.curbB.x - face.curbA.x) / L, z: (face.curbB.z - face.curbA.z) / L };
  const along = (p: Vec2) => (p.x - face.curbA.x) * u.x + (p.z - face.curbA.z) * u.z;
  const inward = (p: Vec2) => -((p.x - face.curbA.x) * face.outward.x + (p.z - face.curbA.z) * face.outward.z);
  return { L, along, inward };
}

const face = (side: Side) => faces.find((f) => f.side === side)!;

// ---------------------------------------------------------------- tests

describe('buildFurniture', () => {
  it('returns a group and colliders', () => {
    const { group, colliders } = build();
    expect(group).toBeInstanceOf(THREE.Group);
    expect(colliders.length).toBeGreaterThan(0);
  });

  it('keeps the whole block to at most 11 meshes (signs included)', () => {
    const { group } = build();
    // 6 material buckets + the emissive lamp-head mesh + one mesh per unique sign text (4 streets here)
    expect(group.children.length).toBeGreaterThanOrEqual(1);
    expect(group.children.length).toBeLessThanOrEqual(11);
  });

  it('requests the furniture material keys from the library', () => {
    const { requested } = build();
    for (const key of ['treeTrunk', 'treeLeaves', 'metalDark', 'hydrant', 'trash', 'concrete']) {
      expect(requested).toContain(key);
    }
  });

  it('every collider is a circle with 0.15 <= r <= 0.5 inside the block curb', () => {
    const { colliders } = build();
    for (const c of colliders) {
      expect(c.shape.kind).toBe('circle');
      const r = circleOf(c).r;
      expect(r).toBeGreaterThanOrEqual(0.15);
      expect(r).toBeLessThanOrEqual(0.5);
      expect(inside(c.pos, curb)).toBe(true);
    }
  });

  it('places a lamppost within 1 m of every block corner', () => {
    const { colliders } = build();
    const poles = colliders.filter((c) => circleOf(c).r === 0.2);
    for (const corner of curb) {
      const near = poles.some((p) => Math.hypot(p.pos.x - corner.x, p.pos.z - corner.z) <= 1.0);
      expect(near).toBe(true);
    }
  });

  it('places a lamppost at the midpoint of every face', () => {
    const { colliders } = build();
    const poles = colliders.filter((c) => circleOf(c).r === 0.2);
    for (const f of faces) {
      const mid = { x: (f.curbA.x + f.curbB.x) / 2 - f.outward.x * 0.6, z: (f.curbA.z + f.curbB.z) / 2 - f.outward.z * 0.6 };
      const near = poles.some((p) => Math.hypot(p.pos.x - mid.x, p.pos.z - mid.z) <= 1.0);
      expect(near).toBe(true);
    }
  });

  it('plants trees about every 12 m, never within 6 m of a corner, spaced at least 10 m apart', () => {
    const { colliders } = build();
    const trees = colliders.filter((c) => circleOf(c).r === 0.35);
    const east = face('E');
    const { L, along, inward } = frame(east);
    const onFace = trees
      .filter((t) => inward(t.pos) > 0.5 && inward(t.pos) < 1.2)
      .map((t) => along(t.pos))
      .sort((a, b) => a - b);
    expect(onFace.length).toBeGreaterThanOrEqual(7);
    expect(onFace[0]).toBeGreaterThanOrEqual(6 - 0.6);
    expect(onFace[onFace.length - 1]).toBeLessThanOrEqual(L - 6 + 0.6);
    for (let i = 1; i < onFace.length; i++) {
      expect(onFace[i] - onFace[i - 1]).toBeGreaterThanOrEqual(10);
    }
  });

  it('skips trees in front of mixed-use lots', () => {
    const { colliders } = build();
    const trees = colliders.filter((c) => circleOf(c).r === 0.35);
    // S face mixed-use lot spans along 3..15 (x). N face mixed-use spans 9..21 (bodega) and 27..39.
    const spans: [Side, number, number][] = [['S', 3, 15], ['N', 9, 21], ['N', 27, 39]];
    for (const [side, lo, hi] of spans) {
      const f = frame(face(side));
      for (const t of trees) {
        if (f.inward(t.pos) < 0.5 || f.inward(t.pos) > 1.2) continue;
        const s = f.along(t.pos);
        expect(s < lo - 0.5 || s > hi + 0.5).toBe(true);
      }
    }
    // and the non-mixed-use stretch of the S face still has trees
    const fs = frame(face('S'));
    const southTrees = trees.filter((t) => fs.inward(t.pos) > 0.5 && fs.inward(t.pos) < 1.2);
    expect(southTrees.length).toBeGreaterThan(0);
  });

  it('places a bodega ice-box mid-way across the sidewalk in front of the bodega lot', () => {
    const { colliders } = build();
    const fn = frame(face('N'));
    // bodega lot front spans along 9..21 on the N face; icebox centre at along 15, inward 1.5
    const icebox = colliders.find((c) => {
      if (circleOf(c).r !== 0.3) return false;
      return Math.abs(fn.along(c.pos) - 15) < 0.05 && Math.abs(fn.inward(c.pos) - 1.5) < 0.05;
    });
    expect(icebox).toBeDefined();
  });

  it('places one hydrant and two trash cans per face, plus one ice-box for the bodega', () => {
    const { colliders } = build();
    const hydrantsTrash = colliders.filter((c) => circleOf(c).r === 0.3);
    expect(hydrantsTrash.length).toBe(4 * 3 + 1);
  });

  it('draws street-name boards per street, oriented parallel to that street', () => {
    const { group, signCalls } = build();
    for (const s of streets) {
      const mesh = group.children.find((c) => (c as THREE.Mesh).material && ((c as THREE.Mesh).material as THREE.Material).name === s.signName) as THREE.Mesh | undefined;
      expect(mesh, `sign mesh for ${s.signName}`).toBeDefined();
      mesh!.geometry.computeBoundingBox();
      const bb = mesh!.geometry.boundingBox!;
      const dx = bb.max.x - bb.min.x;
      const dz = bb.max.z - bb.min.z;
      if (s.axis === 'ns') {
        expect(dz).toBeGreaterThan(1.2);
        expect(dx).toBeLessThan(0.1);
      } else {
        expect(dx).toBeGreaterThan(1.2);
        expect(dz).toBeLessThan(0.1);
      }
    }
    expect(signCalls.length).toBeGreaterThan(0);
    for (const [, bg, fg] of signCalls) {
      expect(bg).toBe('#0a5a2f');
      expect(fg).toBe('#ffffff');
    }
    const texts = new Set(signCalls.map((c) => c[0]));
    for (const s of streets) expect(texts.has(s.signName)).toBe(true);
  });

  it('reports every lamp head position and lights/darkens the lamp-head mesh', () => {
    const { group, lamps } = build();
    expect(lamps.length).toBeGreaterThanOrEqual(4);
    for (const l of lamps) {
      expect(l.height).toBeGreaterThan(6);
      expect(l.height).toBeLessThan(9);
    }
    const head = group.children.find((c) => c.name === 'lamp-head') as THREE.Mesh;
    expect(head).toBeDefined();
    const mat = head.material as THREE.MeshStandardMaterial;
    expect(mat.emissiveIntensity).toBe(0);
    setLampsLit(group, true);
    expect(mat.emissiveIntensity).toBeCloseTo(2.5);
    setLampsLit(group, false);
    expect(mat.emissiveIntensity).toBe(0);
  });

  it('is deterministic for a given seed', () => {
    const a = build(7).colliders.map((c) => ({ r: circleOf(c).r, x: c.pos.x, z: c.pos.z }));
    const b = build(7).colliders.map((c) => ({ r: circleOf(c).r, x: c.pos.x, z: c.pos.z }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
